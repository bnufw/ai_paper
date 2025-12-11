/**
 * 跨会话 Idea 综合评估服务
 */

import { db, getAllIdeaSessions, getIdeaWorkflowConfig } from '../storage/db'
import { getSessionDirectory, readBestIdea, readAllIdeas } from './workflowStorage'
import { callLLM, buildLLMRequest, isValidResponse } from '../ai/llmService'
import type {
  IdeaSession,
  SelectedIdea,
  CrossSessionEvaluationResult
} from '../../types/idea'

/**
 * 获取所有可用的 Idea 会话（已完成的）
 */
export async function getAvailableSessions(): Promise<IdeaSession[]> {
  const sessions = await getAllIdeaSessions()
  return sessions.filter(s => s.status === 'completed')
}

/**
 * 加载会话的所有 Idea
 */
export async function loadSessionIdeas(session: IdeaSession): Promise<{
  bestIdea: string | null
  allIdeas: Map<string, string>
}> {
  const sessionDir = await getSessionDirectory(session.localPath)
  if (!sessionDir) {
    throw new Error(`无法访问会话目录: ${session.localPath}`)
  }

  const [bestIdea, allIdeas] = await Promise.all([
    readBestIdea(sessionDir),
    readAllIdeas(sessionDir)
  ])

  return { bestIdea, allIdeas }
}

/**
 * 批量加载选中的 Idea 内容
 */
export async function loadSelectedIdeasContent(
  selectedIdeas: SelectedIdea[]
): Promise<SelectedIdea[]> {
  const sessionsMap = new Map<number, IdeaSession>()

  // 获取所有相关会话
  for (const idea of selectedIdeas) {
    if (!sessionsMap.has(idea.sessionId)) {
      const session = await db.ideaSessions.get(idea.sessionId)
      if (session) {
        sessionsMap.set(idea.sessionId, session)
      }
    }
  }

  // 并行加载各会话的 Ideas
  const loadedIdeas: SelectedIdea[] = []

  await Promise.all(
    selectedIdeas.map(async (idea) => {
      const session = sessionsMap.get(idea.sessionId)
      if (!session) {
        loadedIdeas.push({ ...idea, content: '[会话不存在]' })
        return
      }

      try {
        const { bestIdea, allIdeas } = await loadSessionIdeas(session)

        let content: string
        if (idea.ideaSlug === 'best_idea') {
          content = bestIdea || '[内容为空]'
        } else {
          content = allIdeas.get(idea.ideaSlug) || '[内容为空]'
        }

        loadedIdeas.push({ ...idea, content })
      } catch (err) {
        loadedIdeas.push({ ...idea, content: `[加载失败: ${(err as Error).message}]` })
      }
    })
  )

  return loadedIdeas
}

/**
 * 构建跨会话评估的输入
 */
function formatIdeasForCrossSessionEvaluation(ideas: SelectedIdea[]): string {
  return ideas.map((idea, index) => {
    return `========== Idea ${index + 1} ==========
来源会话: ${idea.groupName} (${idea.sessionTimestamp})
来源模型: ${idea.displayName}

${idea.content}
`
  }).join('\n\n')
}

/**
 * 跨会话评估提示词
 */
const CROSS_SESSION_EVALUATION_PROMPT = `你是一位资深的学术研究顾问和评审专家。你的任务是对来自不同会话的多个研究 Idea 进行综合评估和排名。

## 评估维度

请从以下维度对每个 Idea 进行评估：

1. **创新性 (Novelty)**: 想法的原创性和突破程度
2. **可行性 (Feasibility)**: 技术实现的难度和资源需求
3. **影响力 (Impact)**: 潜在的学术和实际应用价值
4. **完整性 (Completeness)**: 方法论的完整程度和细节充分度

## 输出格式

请按以下 Markdown 格式输出评估结果：

### 最终排名

| 排名 | Idea | 综合得分 | 简要理由 |
|-----|------|---------|---------|
| 1 | [Idea X] | [1-10] | [一句话理由] |
| 2 | [Idea Y] | [1-10] | [一句话理由] |
...

### 综合分析

[对所有 Idea 的横向比较分析，包括各自的优势和劣势]

### 最终建议

[给出明确的推荐意见，包括：]
- 最推荐投入资源的 Idea
- 可以作为备选的 Idea
- 建议改进的方向

---

请现在开始评估以下 Ideas：
`

/**
 * 执行跨会话评估
 */
export async function evaluateCrossSessionIdeas(
  ideas: SelectedIdea[],
  customPrompt?: string,
  onProgress?: (message: string) => void
): Promise<CrossSessionEvaluationResult> {
  if (ideas.length < 2) {
    throw new Error('请至少选择 2 个 Idea 进行比较评估')
  }

  onProgress?.('加载 Idea 内容...')

  // 加载内容
  const loadedIdeas = await loadSelectedIdeasContent(ideas)

  onProgress?.('正在进行综合评估...')

  // 获取筛选器配置（复用现有的 summarizer 配置）
  const config = await getIdeaWorkflowConfig()

  // 构建评估输入
  const evaluationInput = formatIdeasForCrossSessionEvaluation(loadedIdeas)
  const prompt = customPrompt?.trim() || CROSS_SESSION_EVALUATION_PROMPT

  // 调用 LLM
  const request = buildLLMRequest(config.summarizer, prompt, evaluationInput)
  const response = await callLLM(request)

  if (!isValidResponse(response)) {
    throw new Error(response.error || '评估失败')
  }

  onProgress?.('评估完成')

  // 解析结果（简化处理：直接返回原始内容，由 UI 渲染 Markdown）
  // 高级版本可以使用正则解析表格提取排名数据
  return {
    ranking: loadedIdeas.map((idea, index) => ({
      rank: index + 1,
      ideaId: `${idea.sessionId}_${idea.ideaSlug}`,
      score: 0,  // 由 AI 在 analysis 中给出
      summary: idea.displayName
    })),
    analysis: response.content,
    generatedAt: new Date()
  }
}
