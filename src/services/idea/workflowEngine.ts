/**
 * Idea 工作流引擎
 * 三阶段流水线：生成 → 评审 → 筛选
 */

import type {
  WorkflowState,
  WorkflowPhase,
  ModelTaskState,
  ModelStatus
} from '../../types/idea'
import {
  getIdeaWorkflowConfig,
  createIdeaSession,
  updateIdeaSessionStatus
} from '../storage/db'
import { callLLM, buildLLMRequest, isValidResponse } from '../ai/llmService'
import { getPrompt } from './defaultPrompts'
import {
  generateTimestamp,
  getGroupName,
  createWorkflowDirectory,
  saveIdea,
  saveReview,
  saveBestIdea,
  collectGeneratorContext,
  formatIdeasForReview,
  formatForSummarizer
} from './workflowStorage'

type StateListener = (state: WorkflowState) => void

/**
 * 创建初始状态
 */
function createInitialState(): WorkflowState {
  return {
    phase: 'idle',
    generators: new Map(),
    evaluators: new Map(),
    summarizer: { status: 'pending' },
    progress: { current: 0, total: 0, description: '' }
  }
}

/**
 * 工作流引擎类
 */
export class IdeaWorkflowEngine {
  private state: WorkflowState = createInitialState()
  private abortController: AbortController | null = null
  private listeners: Set<StateListener> = new Set()
  private isRunning = false  // 独立的运行锁，防止重入

  /**
   * 获取当前状态
   */
  getState(): WorkflowState {
    return this.state
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 通知状态变化（深拷贝避免外部修改内部状态）
   */
  private notify(): void {
    const stateCopy: WorkflowState = {
      ...this.state,
      generators: new Map(this.state.generators),
      evaluators: new Map(this.state.evaluators),
      summarizer: { ...this.state.summarizer },
      progress: { ...this.state.progress }
    }
    for (const listener of this.listeners) {
      listener(stateCopy)
    }
  }

  /**
   * 更新阶段
   */
  private setPhase(phase: WorkflowPhase, description?: string): void {
    this.state.phase = phase
    if (description) {
      this.state.progress.description = description
    }
    this.notify()
  }

  /**
   * 更新模型状态
   */
  private updateModelStatus(
    stage: 'generators' | 'evaluators',
    slug: string,
    status: ModelStatus,
    output?: string,
    error?: string
  ): void {
    const taskState: ModelTaskState = {
      status,
      output,
      error,
      startTime: status === 'running' ? new Date() : this.state[stage].get(slug)?.startTime,
      endTime: status === 'completed' || status === 'failed' ? new Date() : undefined
    }
    this.state[stage].set(slug, taskState)
    this.notify()
  }

  /**
   * 更新筛选器状态
   */
  private updateSummarizerStatus(
    status: ModelStatus,
    output?: string,
    error?: string
  ): void {
    this.state.summarizer = {
      status,
      output,
      error,
      startTime: status === 'running' ? new Date() : this.state.summarizer.startTime,
      endTime: status === 'completed' || status === 'failed' ? new Date() : undefined
    }
    this.notify()
  }

  /**
   * 更新进度
   */
  private updateProgress(current: number, total: number, description: string): void {
    this.state.progress = { current, total, description }
    this.notify()
  }

  /**
   * 取消工作流
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.setPhase('cancelled', '工作流已取消')

    // 更新数据库中的会话状态
    if (this.state.sessionId) {
      updateIdeaSessionStatus(this.state.sessionId, 'cancelled').catch(error => {
        console.error('更新会话状态失败:', error)
      })
    }
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = createInitialState()
    this.abortController = null
    this.notify()
  }

  /**
   * 运行工作流
   */
  async run(groupId: number): Promise<void> {
    // 防重入：使用独立锁而非 phase（避免 reset 后被绕过）
    if (this.isRunning) {
      console.warn('工作流已在运行中，忽略重复调用')
      return
    }
    this.isRunning = true

    // 重置状态
    this.reset()
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    try {
      // 阶段 0: 准备
      this.setPhase('preparing', '正在准备...')
      this.state.groupId = groupId

      // 获取分组名称
      const groupName = await getGroupName(groupId)
      this.state.groupName = groupName

      // 获取工作流配置
      const config = await getIdeaWorkflowConfig()
      // 按 slug 去重（防止同一模型被配置多次）
      const dedupeBySlug = (models: typeof config.generators) => {
        const seen = new Set<string>()
        return models.filter(m => {
          if (seen.has(m.slug)) return false
          seen.add(m.slug)
          return true
        })
      }
      const enabledGenerators = dedupeBySlug(config.generators.filter(g => g.enabled))
      const enabledEvaluators = dedupeBySlug(config.evaluators.filter(e => e.enabled))

      if (enabledGenerators.length === 0) {
        throw new Error('没有启用的生成器模型，请先在设置中配置')
      }

      if (enabledEvaluators.length === 0) {
        throw new Error('没有启用的评审器模型，请先在设置中配置')
      }

      // 初始化模型状态
      for (const gen of enabledGenerators) {
        this.state.generators.set(gen.slug, { status: 'pending' })
      }
      for (const eval_ of enabledEvaluators) {
        this.state.evaluators.set(eval_.slug, { status: 'pending' })
      }

      // 计算总任务数
      const totalTasks = enabledGenerators.length + enabledEvaluators.length + 1
      this.updateProgress(0, totalTasks, '收集上下文')

      // 收集生成器上下文（领域知识 + 论文笔记 + 用户研究方向）
      const context = await collectGeneratorContext(groupId, groupName, config.userIdea || '')

      if (signal.aborted) return

      // 创建会话目录
      const timestamp = generateTimestamp()
      const { handle: sessionDir, path: localPath } = await createWorkflowDirectory(groupName, timestamp)

      // 创建数据库会话记录
      const sessionId = await createIdeaSession(groupId, groupName, timestamp, localPath)
      this.state.sessionId = sessionId

      // ========== 阶段 1: 生成 ==========
      this.setPhase('generating', '正在生成 Idea...')

      const ideas = new Map<string, string>()
      let completedGenerators = 0

      const generatorPrompt = getPrompt('generator', config.prompts.generator)

      await Promise.allSettled(
        enabledGenerators.map(async (gen) => {
          this.updateModelStatus('generators', gen.slug, 'running')

          try {
            const request = buildLLMRequest(gen, generatorPrompt, context, signal)
            const response = await callLLM(request)

            if (signal.aborted) return

            if (isValidResponse(response)) {
              ideas.set(gen.slug, response.content)
              this.updateModelStatus('generators', gen.slug, 'completed', response.content)
            } else {
              this.updateModelStatus('generators', gen.slug, 'failed', undefined, response.error || '生成失败')
            }
          } catch (e) {
            if (!signal.aborted) {
              this.updateModelStatus('generators', gen.slug, 'failed', undefined, (e as Error).message)
            }
          }

          completedGenerators++
          this.updateProgress(completedGenerators, totalTasks, `生成中 (${completedGenerators}/${enabledGenerators.length})`)
        })
      )

      if (signal.aborted) return

      // 检查是否有有效的 Idea
      if (ideas.size === 0) {
        throw new Error('所有生成器都失败了，无法继续')
      }

      // 按固定顺序分配索引并保存 Idea 文件
      let ideaIndex = 1
      for (const [slug, content] of ideas) {
        await saveIdea(sessionDir, ideaIndex, slug, content)
        ideaIndex++
      }

      // ========== 阶段 2: 评审 ==========
      this.setPhase('evaluating', '正在评审 Idea...')

      const reviews = new Map<string, string>()
      let completedEvaluators = 0
      const baseProgress = enabledGenerators.length

      const evaluatorPrompt = getPrompt('evaluator', config.prompts.evaluator)
      const ideasForReview = formatIdeasForReview(ideas)

      await Promise.allSettled(
        enabledEvaluators.map(async (eval_) => {
          this.updateModelStatus('evaluators', eval_.slug, 'running')

          try {
            const request = buildLLMRequest(eval_, evaluatorPrompt, ideasForReview, signal)
            const response = await callLLM(request)

            if (signal.aborted) return

            if (isValidResponse(response)) {
              reviews.set(eval_.slug, response.content)
              await saveReview(sessionDir, eval_.slug, response.content)
              this.updateModelStatus('evaluators', eval_.slug, 'completed', response.content)
            } else {
              this.updateModelStatus('evaluators', eval_.slug, 'failed', undefined, response.error || '评审失败')
            }
          } catch (e) {
            if (!signal.aborted) {
              this.updateModelStatus('evaluators', eval_.slug, 'failed', undefined, (e as Error).message)
            }
          }

          completedEvaluators++
          this.updateProgress(
            baseProgress + completedEvaluators,
            totalTasks,
            `评审中 (${completedEvaluators}/${enabledEvaluators.length})`
          )
        })
      )

      if (signal.aborted) return

      // 检查是否有有效的评审
      if (reviews.size === 0) {
        throw new Error('所有评审器都失败了，无法继续')
      }

      // ========== 阶段 3: 筛选 ==========
      this.setPhase('summarizing', '正在筛选最佳 Idea...')
      this.updateSummarizerStatus('running')

      const summarizerPrompt = getPrompt('summarizer', config.prompts.summarizer)
      const summarizerInput = formatForSummarizer(ideas, reviews)

      try {
        const request = buildLLMRequest(config.summarizer, summarizerPrompt, summarizerInput, signal)
        const response = await callLLM(request)

        if (signal.aborted) return

        if (isValidResponse(response)) {
          await saveBestIdea(sessionDir, response.content)
          this.updateSummarizerStatus('completed', response.content)
          this.state.bestIdea = response.content

          // 更新数据库会话状态
          await updateIdeaSessionStatus(sessionId, 'completed', {
            bestIdeaSlug: config.summarizer.slug
          })
        } else {
          this.updateSummarizerStatus('failed', undefined, response.error || '筛选失败')
          throw new Error(response.error || '筛选失败')
        }
      } catch (e) {
        if (!signal.aborted) {
          this.updateSummarizerStatus('failed', undefined, (e as Error).message)
          throw e
        }
      }

      this.updateProgress(totalTasks, totalTasks, '完成')
      this.setPhase('completed', '工作流完成')

    } catch (error) {
      if (this.abortController?.signal.aborted) {
        this.setPhase('cancelled', '工作流已取消')
      } else {
        this.state.error = (error as Error).message
        this.setPhase('failed', `失败: ${(error as Error).message}`)

        // 更新数据库中的会话状态
        if (this.state.sessionId) {
          await updateIdeaSessionStatus(this.state.sessionId, 'failed', {
            error: (error as Error).message
          })
        }
      }
    } finally {
      this.isRunning = false  // 无论成功失败都释放锁
    }
  }
}

// 导出单例
export const workflowEngine = new IdeaWorkflowEngine()
