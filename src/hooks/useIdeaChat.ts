import { useState, useEffect, useRef, useCallback } from 'react'
import { type Message, getPaperMarkdown } from '../services/storage/db'
import { getSessionDirectory, readBestIdea, readAllIdeas } from '../services/idea/workflowStorage'
import { sendMessageToGemini } from '../services/ai/geminiClient'
import type { IdeaSession } from '../types/idea'

// 引用解析正则（与 useChat 保持一致）
const MENTION_PATTERN = /@\[([^\]]+)\]\(paperId:(\d+)\)/g
const MAX_MENTIONS = 3

interface IdeaChatState {
  messages: Message[]
  loading: boolean
  error: string
  streamingText: string
  streamingThought: string
  streamingStartTime: Date | null
  bestIdea: string | null
  allIdeas: Map<string, string>
  currentIdeaSlug: string
}

/**
 * Idea 对话 Hook
 * 上下文包含：best_idea + 所有候选 ideas
 * 支持 @[论文标题](paperId:xxx) 引用论文内容
 */
export function useIdeaChat(session: IdeaSession | null) {
  const [state, setState] = useState<IdeaChatState>({
    messages: [],
    loading: false,
    error: '',
    streamingText: '',
    streamingThought: '',
    streamingStartTime: null,
    bestIdea: null,
    allIdeas: new Map(),
    currentIdeaSlug: 'best_idea'
  })

  const contextRef = useRef<string | null>(null)

  // 加载会话内容
  useEffect(() => {
    if (!session) {
      setState(prev => ({
        ...prev,
        messages: [],
        bestIdea: null,
        allIdeas: new Map(),
        currentIdeaSlug: 'best_idea',
        error: ''
      }))
      contextRef.current = null
      return
    }

    // 切换会话时清空消息和上下文
    setState(prev => ({
      ...prev,
      messages: [],
      bestIdea: null,
      allIdeas: new Map(),
      error: ''
    }))
    contextRef.current = null

    async function loadSessionContent() {
      try {
        const sessionDir = await getSessionDirectory(session!.localPath)
        if (!sessionDir) {
          setState(prev => ({ ...prev, error: '无法访问会话目录' }))
          return
        }

        // 并行加载 best_idea 和所有 ideas
        const [bestIdea, allIdeas] = await Promise.all([
          readBestIdea(sessionDir),
          readAllIdeas(sessionDir)
        ])

        if (!bestIdea) {
          setState(prev => ({ ...prev, error: 'best_idea 内容为空' }))
          return
        }

        // 构建上下文：best_idea + 所有 ideas
        const contextParts: string[] = []
        contextParts.push(`# 当前最佳 Idea\n\n${bestIdea}`)

        // 添加所有候选 ideas
        if (allIdeas.size > 0) {
          const ideasContent = Array.from(allIdeas.entries())
            .map(([slug, content]) => `## ${slug}\n\n${content}`)
            .join('\n\n')
          contextParts.push(`# 所有候选 Ideas\n\n${ideasContent}`)
        }

        contextRef.current = contextParts.join('\n\n---\n\n')

        setState(prev => ({
          ...prev,
          bestIdea,
          allIdeas,
          currentIdeaSlug: 'best_idea',
          error: ''
        }))
      } catch (err) {
        console.error('加载会话内容失败:', err)
        setState(prev => ({
          ...prev,
          error: (err as Error).message
        }))
      }
    }

    loadSessionContent()
  }, [session?.id])

  // 切换显示的 idea
  const setCurrentIdeaSlug = useCallback((slug: string) => {
    setState(prev => ({ ...prev, currentIdeaSlug: slug }))
  }, [])

  // 获取当前显示的 idea 内容
  const getCurrentIdeaContent = useCallback(() => {
    if (state.currentIdeaSlug === 'best_idea') {
      return state.bestIdea
    }
    return state.allIdeas.get(state.currentIdeaSlug) || null
  }, [state.currentIdeaSlug, state.bestIdea, state.allIdeas])

  // 解析消息中的论文引用并加载 markdown 内容（带截断）
  const loadMentionedPapers = useCallback(async (content: string): Promise<string> => {
    const mentions: { paperId: number; title: string }[] = []
    let match
    const regex = new RegExp(MENTION_PATTERN)

    while ((match = regex.exec(content)) !== null) {
      const paperId = parseInt(match[2], 10)
      // 去重：同一论文只加载一次
      if (!mentions.some(m => m.paperId === paperId)) {
        mentions.push({ title: match[1], paperId })
      }
    }

    if (mentions.length === 0) return ''

    // 引用数量限制
    if (mentions.length > MAX_MENTIONS) {
      throw new Error(`单条消息最多引用 ${MAX_MENTIONS} 篇论文`)
    }

    const paperContents = await Promise.all(
      mentions.map(async ({ paperId, title }) => {
        try {
          // 使用 getPaperMarkdown 复用截断逻辑（50KB）
          const markdown = await getPaperMarkdown(paperId)
          return `\n\n[引用论文: ${title}]\n${markdown}\n[/引用论文]\n`
        } catch (err) {
          console.warn(`加载论文 ${title} 失败:`, err)
          return `\n\n[引用论文: ${title}]\n[无法读取论文内容]\n[/引用论文]\n`
        }
      })
    )

    return paperContents.length > 0
      ? `\n\n---\n\n# 引用的论文内容${paperContents.join('')}`
      : ''
  }, [])

  // 发送消息
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !session || state.loading) return

    // 检查上下文是否已加载
    if (!contextRef.current) {
      setState(prev => ({ ...prev, error: '正在加载上下文，请稍候' }))
      return
    }

    setState(prev => ({
      ...prev,
      loading: true,
      error: '',
      streamingText: '',
      streamingThought: '',
      streamingStartTime: new Date()
    }))

    // 创建用户消息
    const userMessage: Message = {
      conversationId: session.id!,
      role: 'user',
      content,
      timestamp: new Date()
    }

    // 乐观更新：立即显示用户消息
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage]
    }))

    try {
      // 构建历史消息
      const history = state.messages.slice(-20).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }))

      // 加载引用的论文内容
      const mentionedPapersContent = await loadMentionedPapers(content)
      const fullContext = contextRef.current + mentionedPapersContent

      // 调用 Gemini API
      const result = await sendMessageToGemini(
        fullContext,
        content,
        history,
        undefined,
        (text) => setState(prev => ({ ...prev, streamingText: text })),
        (thought) => setState(prev => ({ ...prev, streamingThought: thought })),
        () => {}
      )

      // 创建 AI 回复消息
      const assistantMessage: Message = {
        conversationId: session.id!,
        role: 'assistant',
        content: result.content,
        timestamp: new Date(),
        thoughts: result.thoughts,
        thinkingTimeMs: result.thinkingTimeMs
      }

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        loading: false,
        streamingText: '',
        streamingThought: '',
        streamingStartTime: null
      }))

    } catch (err: any) {
      console.error('发送消息失败:', err)
      setState(prev => ({
        ...prev,
        loading: false,
        error: err.message || '发送消息失败',
        streamingText: '',
        streamingThought: '',
        streamingStartTime: null
      }))
    }
  }, [session, state.loading, state.messages, loadMentionedPapers])

  // 清空对话
  const clearMessages = useCallback(() => {
    setState(prev => ({ ...prev, messages: [] }))
  }, [])

  return {
    ...state,
    sendMessage,
    clearMessages,
    setCurrentIdeaSlug,
    getCurrentIdeaContent
  }
}
