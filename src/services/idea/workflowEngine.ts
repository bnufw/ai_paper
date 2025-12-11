/**
 * Idea 工作流引擎
 * 三阶段流水线：生成 → 评审 → 筛选
 */

import type {
  WorkflowState,
  WorkflowPhase,
  ModelTaskState,
  ModelStatus,
  ModelConfig,
  LLMResponse
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

// 工作流级别的重试配置
const WORKFLOW_MAX_RETRIES = 3

/**
 * 判断 LLM 响应是否需要重试
 */
function shouldRetryResponse(response: LLMResponse): boolean {
  // 有错误
  if (response.error) return true
  // 内容为空
  if (!response.content || response.content.trim().length === 0) return true
  return false
}

/**
 * 计算指数退避延迟时间（毫秒）
 */
function calculateBackoffDelay(attempt: number): number {
  const base = 1000
  const max = 8000
  return Math.min(base * Math.pow(2, attempt) + Math.random() * 500, max)
}

/**
 * 带重试的单模型调用
 * 只重试失败/空值的响应，成功则立即返回
 */
async function callModelWithRetry(
  config: ModelConfig,
  prompt: string,
  context: string,
  signal: AbortSignal,
  modelSlug: string,
  maxRetries: number = WORKFLOW_MAX_RETRIES
): Promise<LLMResponse> {
  let lastResponse: LLMResponse = { content: '', error: '未执行' }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) {
      return { content: '', error: '请求已取消' }
    }

    try {
      const request = buildLLMRequest(config, prompt, context, signal)
      const response = await callLLM(request)

      // 成功：无错误且内容非空
      if (!shouldRetryResponse(response)) {
        return response
      }

      lastResponse = response

      // 最后一次尝试不等待
      if (attempt < maxRetries) {
        const delayMs = calculateBackoffDelay(attempt)
        console.log(`[Workflow] ${modelSlug} 响应无效（${response.error || '内容为空'}），将在 ${Math.round(delayMs)}ms 后进行第 ${attempt + 1} 次重试`)
        await new Promise(r => setTimeout(r, delayMs))
      }
    } catch (e: any) {
      lastResponse = { content: '', error: e.message }

      if (attempt < maxRetries) {
        const delayMs = calculateBackoffDelay(attempt)
        console.log(`[Workflow] ${modelSlug} 调用异常（${e.message}），将在 ${Math.round(delayMs)}ms 后进行第 ${attempt + 1} 次重试`)
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }

  // 标记已重试
  if (lastResponse.error) {
    lastResponse.error = `${lastResponse.error}（已重试 ${maxRetries} 次）`
  }
  return lastResponse
}

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
      const enabledGenerators = config.generators.filter(g => g.enabled)
      const enabledEvaluators = config.evaluators.filter(e => e.enabled)

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

          // 使用带重试的调用函数
          const response = await callModelWithRetry(gen, generatorPrompt, context, signal, gen.slug)

          if (signal.aborted) return

          if (isValidResponse(response)) {
            ideas.set(gen.slug, response.content)
            await saveIdea(sessionDir, gen.slug, response.content)
            this.updateModelStatus('generators', gen.slug, 'completed', response.content)
          } else {
            this.updateModelStatus('generators', gen.slug, 'failed', undefined, response.error || '生成失败')
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

          // 使用带重试的调用函数
          const response = await callModelWithRetry(eval_, evaluatorPrompt, ideasForReview, signal, eval_.slug)

          if (signal.aborted) return

          if (isValidResponse(response)) {
            reviews.set(eval_.slug, response.content)
            await saveReview(sessionDir, eval_.slug, response.content)
            this.updateModelStatus('evaluators', eval_.slug, 'completed', response.content)
          } else {
            this.updateModelStatus('evaluators', eval_.slug, 'failed', undefined, response.error || '评审失败')
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

      // 使用带重试的调用函数
      const response = await callModelWithRetry(
        config.summarizer,
        summarizerPrompt,
        summarizerInput,
        signal,
        config.summarizer.slug
      )

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
    }
  }
}

// 导出单例
export const workflowEngine = new IdeaWorkflowEngine()
