import { useState, useEffect, useRef, useCallback } from 'react'
import {
  type IdeaMessage,
  type IdeaConversation,
  getIdeaMessages,
  saveIdeaMessage,
  deleteIdeaMessages,
  getPaperMarkdown,
  getIdeaConversations,
  createIdeaConversation,
  deleteIdeaConversation,
  renameIdeaConversation
} from '../services/storage/db'
import { getSessionDirectory, readBestIdea, readAllIdeas, type IdeaEntry } from '../services/idea/workflowStorage'
import { sendMessageToGemini } from '../services/ai/geminiClient'
import type { IdeaSession } from '../types/idea'

const MENTION_PATTERN = /@\[([^\]]+)\]\(paperId:(\d+)\)/g
const MAX_MENTIONS = 3

interface IdeaChatState {
  messages: IdeaMessage[]
  conversations: IdeaConversation[]
  currentConversationId: number | null
  loading: boolean
  error: string
  streamingText: string
  streamingThought: string
  streamingStartTime: Date | null
  bestIdea: string | null
  allIdeas: IdeaEntry[]
  currentIdeaSlug: string
}

export function useIdeaChat(session: IdeaSession | null) {
  const [state, setState] = useState<IdeaChatState>({
    messages: [],
    conversations: [],
    currentConversationId: null,
    loading: false,
    error: '',
    streamingText: '',
    streamingThought: '',
    streamingStartTime: null,
    bestIdea: null,
    allIdeas: [],
    currentIdeaSlug: 'best_idea'
  })

  const contextRef = useRef<string | null>(null)
  const sessionIdRef = useRef<number | null>(null)
  const activeConversationIdRef = useRef<number | null>(null)  // 跟踪发送中的对话

  // 加载会话内容和对话列表
  useEffect(() => {
    if (!session) {
      setState(prev => ({
        ...prev,
        messages: [],
        conversations: [],
        currentConversationId: null,
        bestIdea: null,
        allIdeas: [],
        currentIdeaSlug: 'best_idea',
        error: ''
      }))
      contextRef.current = null
      sessionIdRef.current = null
      return
    }

    // 切换 session 时重置状态
    setState(prev => ({
      ...prev,
      messages: [],
      conversations: [],
      currentConversationId: null,
      bestIdea: null,
      allIdeas: [],
      error: ''
    }))
    contextRef.current = null
    sessionIdRef.current = session.id!

    async function loadSessionContent() {
      const currentSessionId = session!.id!
      try {
        const sessionDir = await getSessionDirectory(session!.localPath)
        if (!sessionDir) {
          setState(prev => ({ ...prev, error: '无法访问会话目录' }))
          return
        }

        // 并行加载 best_idea、所有 ideas 和对话列表
        const [bestIdea, allIdeas, convs] = await Promise.all([
          readBestIdea(sessionDir),
          readAllIdeas(sessionDir),
          getIdeaConversations(currentSessionId)
        ])

        // 防止竞态：检查 session 是否已切换
        if (sessionIdRef.current !== currentSessionId) return

        if (!bestIdea) {
          setState(prev => ({ ...prev, error: 'best_idea 内容为空' }))
          return
        }

        // 构建上下文
        const contextParts: string[] = []
        contextParts.push(`# 当前最佳 Idea\n\n${bestIdea}`)
        if (allIdeas.length > 0) {
          const ideasContent = allIdeas
            .map(idea => `## Idea ${idea.index}\n\n${idea.content}`)
            .join('\n\n')
          contextParts.push(`# 所有候选 Ideas\n\n${ideasContent}`)
        }
        contextRef.current = contextParts.join('\n\n---\n\n')

        // 如果没有对话，自动创建一个
        let conversations = convs
        let currentConvId: number | null = null

        if (conversations.length === 0) {
          const newConvId = await createIdeaConversation(currentSessionId, '新对话')
          conversations = await getIdeaConversations(currentSessionId)
          currentConvId = newConvId
        } else {
          currentConvId = conversations[0].id!
        }

        // 加载当前对话的消息
        const messages = currentConvId ? await getIdeaMessages(currentConvId) : []

        // 再次检查竞态
        if (sessionIdRef.current !== currentSessionId) return

        setState(prev => ({
          ...prev,
          messages,
          conversations,
          currentConversationId: currentConvId,
          bestIdea,
          allIdeas,
          currentIdeaSlug: 'best_idea',
          error: ''
        }))
      } catch (err) {
        console.error('加载会话内容失败:', err)
        if (sessionIdRef.current === currentSessionId) {
          setState(prev => ({ ...prev, error: (err as Error).message }))
        }
      }
    }

    loadSessionContent()
  }, [session?.id])

  // 切换对话
  const switchConversation = useCallback(async (conversationId: number) => {
    if (conversationId === state.currentConversationId) return

    try {
      const messages = await getIdeaMessages(conversationId)
      setState(prev => ({
        ...prev,
        currentConversationId: conversationId,
        messages,
        error: ''
      }))
    } catch (err) {
      console.error('切换对话失败:', err)
      setState(prev => ({ ...prev, error: '切换对话失败' }))
    }
  }, [state.currentConversationId])

  // 创建新对话
  const createNewConversation = useCallback(async () => {
    if (!session) return

    try {
      const newConvId = await createIdeaConversation(session.id!, '新对话')
      const conversations = await getIdeaConversations(session.id!)

      setState(prev => ({
        ...prev,
        conversations,
        currentConversationId: newConvId,
        messages: []
      }))
    } catch (err) {
      console.error('创建对话失败:', err)
      setState(prev => ({ ...prev, error: '创建对话失败' }))
    }
  }, [session])

  // 删除对话
  const deleteConversation = useCallback(async (conversationId: number) => {
    if (!session) return

    try {
      await deleteIdeaConversation(conversationId)
      let conversations = await getIdeaConversations(session.id!)

      // 如果删除后没有对话了，自动创建一个
      let newCurrentId: number | null = null
      if (conversations.length === 0) {
        newCurrentId = await createIdeaConversation(session.id!, '新对话')
        conversations = await getIdeaConversations(session.id!)
      } else if (conversationId === state.currentConversationId) {
        newCurrentId = conversations[0].id!
      } else {
        newCurrentId = state.currentConversationId
      }

      const messages = newCurrentId ? await getIdeaMessages(newCurrentId) : []

      setState(prev => ({
        ...prev,
        conversations,
        currentConversationId: newCurrentId,
        messages
      }))
    } catch (err) {
      console.error('删除对话失败:', err)
      setState(prev => ({ ...prev, error: '删除对话失败' }))
    }
  }, [session, state.currentConversationId])

  // 重命名对话
  const renameConversation = useCallback(async (conversationId: number, newTitle: string) => {
    if (!session) return

    try {
      await renameIdeaConversation(conversationId, newTitle)
      const conversations = await getIdeaConversations(session.id!)
      setState(prev => ({ ...prev, conversations }))
    } catch (err) {
      console.error('重命名对话失败:', err)
      setState(prev => ({ ...prev, error: '重命名对话失败' }))
    }
  }, [session])

  // 切换显示的 idea
  const setCurrentIdeaSlug = useCallback((slug: string) => {
    setState(prev => ({ ...prev, currentIdeaSlug: slug }))
  }, [])

  // 获取当前显示的 idea 内容
  const getCurrentIdeaContent = useCallback(() => {
    if (state.currentIdeaSlug === 'best_idea') {
      return state.bestIdea
    }
    const match = state.currentIdeaSlug.match(/^idea_(\d+)$/)
    if (match) {
      const index = parseInt(match[1], 10)
      const idea = state.allIdeas.find(i => i.index === index)
      return idea?.content || null
    }
    return null
  }, [state.currentIdeaSlug, state.bestIdea, state.allIdeas])

  // 解析消息中的论文引用
  const loadMentionedPapers = useCallback(async (content: string): Promise<string> => {
    const mentions: { paperId: number; title: string }[] = []
    let match
    const regex = new RegExp(MENTION_PATTERN)

    while ((match = regex.exec(content)) !== null) {
      const paperId = parseInt(match[2], 10)
      if (!mentions.some(m => m.paperId === paperId)) {
        mentions.push({ title: match[1], paperId })
      }
    }

    if (mentions.length === 0) return ''

    if (mentions.length > MAX_MENTIONS) {
      throw new Error(`单条消息最多引用 ${MAX_MENTIONS} 篇论文`)
    }

    const paperContents = await Promise.all(
      mentions.map(async ({ paperId, title }) => {
        try {
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
    if (!content.trim() || !session || state.loading || !state.currentConversationId) return

    if (!contextRef.current) {
      setState(prev => ({ ...prev, error: '正在加载上下文，请稍候' }))
      return
    }

    // 捕获当前 conversationId 防止竞态
    const conversationId = state.currentConversationId
    activeConversationIdRef.current = conversationId

    setState(prev => ({
      ...prev,
      loading: true,
      error: '',
      streamingText: '',
      streamingThought: '',
      streamingStartTime: new Date()
    }))

    try {
      const userMessage: IdeaMessage = {
        conversationId,
        role: 'user',
        content,
        timestamp: new Date()
      }

      const savedUserMsgId = await saveIdeaMessage(userMessage)
      const savedUserMessage = { ...userMessage, id: savedUserMsgId }

      // 检查对话是否已切换
      if (activeConversationIdRef.current !== conversationId) return

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, savedUserMessage]
      }))

      // 自动更新对话标题（第一条消息时）
      if (state.messages.length === 0) {
        const title = content.substring(0, 30).trim() + (content.length > 30 ? '...' : '')
        await renameIdeaConversation(conversationId, title)
        const conversations = await getIdeaConversations(session.id!)
        setState(prev => ({ ...prev, conversations }))
      }

      const history = state.messages.slice(-20).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }))

      const mentionedPapersContent = await loadMentionedPapers(content)
      const fullContext = contextRef.current + mentionedPapersContent

      const result = await sendMessageToGemini(
        fullContext,
        content,
        history,
        undefined,
        (text) => {
          // 只有当对话未切换时才更新 streaming
          if (activeConversationIdRef.current === conversationId) {
            setState(prev => ({ ...prev, streamingText: text }))
          }
        },
        (thought) => {
          if (activeConversationIdRef.current === conversationId) {
            setState(prev => ({ ...prev, streamingThought: thought }))
          }
        },
        () => {}
      )

      const assistantMessage: IdeaMessage = {
        conversationId,
        role: 'assistant',
        content: result.content,
        timestamp: new Date(),
        thoughts: result.thoughts,
        thinkingTimeMs: result.thinkingTimeMs
      }

      const savedAssistantMsgId = await saveIdeaMessage(assistantMessage)
      const savedAssistantMessage = { ...assistantMessage, id: savedAssistantMsgId }

      // 再次检查对话是否已切换
      if (activeConversationIdRef.current !== conversationId) return

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, savedAssistantMessage],
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
    } finally {
      activeConversationIdRef.current = null
    }
  }, [session, state.loading, state.messages, state.currentConversationId, loadMentionedPapers])

  // 清空当前对话的消息
  const clearMessages = useCallback(async () => {
    if (state.currentConversationId) {
      await deleteIdeaMessages(state.currentConversationId)
    }
    setState(prev => ({ ...prev, messages: [] }))
  }, [state.currentConversationId])

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: '' }))
  }, [])

  return {
    ...state,
    sendMessage,
    clearMessages,
    setCurrentIdeaSlug,
    getCurrentIdeaContent,
    clearError,
    createNewConversation,
    switchConversation,
    deleteConversation,
    renameConversation
  }
}
