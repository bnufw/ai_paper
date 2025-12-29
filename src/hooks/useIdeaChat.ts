import { useState, useEffect, useRef, useCallback } from 'react'
import {
  type IdeaMessage,
  type IdeaConversation,
  type MessageImage,
  type BranchInfo,
  getIdeaMessages,
  saveIdeaMessage,
  deleteIdeaMessages,
  getPaperMarkdown,
  getIdeaConversations,
  createIdeaConversation,
  deleteIdeaConversation,
  renameIdeaConversation,
  deleteIdeaMessagesAfter,
  clearIdeaConversationContext,
  saveIdeaMessageVersion,
  getIdeaConversationBranches,
  createIdeaBranch,
  switchIdeaBranch,
  getIdeaBranchMessages,
  getIdeaActiveBranchId,
  hasIdeaMessageBranches,
  getIdeaBranchesFromMessage
} from '../services/storage/db'
import { getSessionDirectory, readBestIdea, readAllIdeas, type IdeaEntry } from '../services/idea/workflowStorage'
import { sendMessageToGemini } from '../services/ai/geminiClient'
import { backgroundTaskManager } from '../services/chat/backgroundTaskManager'
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
  // 新增状态（与论文对话对齐）
  editingMessageId: number | null
  branches: BranchInfo[]
  activeBranchId: number
  lastClearAt: Date | null
  backgroundTaskCount: number
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
    currentIdeaSlug: 'best_idea',
    // 新增状态初始值
    editingMessageId: null,
    branches: [],
    activeBranchId: 0,
    lastClearAt: null,
    backgroundTaskCount: 0
  })

  const contextRef = useRef<string | null>(null)
  const sessionIdRef = useRef<number | null>(null)
  const activeConversationIdRef = useRef<number | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // 监听后台任务
  useEffect(() => {
    if (!session) return

    const unsubscribe = backgroundTaskManager.subscribe(() => {
      const runningTasks = backgroundTaskManager.getRunningTasksForSession(session.id!)
      setState(prev => ({ ...prev, backgroundTaskCount: runningTasks.length }))
    })

    return unsubscribe
  }, [session?.id])

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
        error: '',
        editingMessageId: null,
        branches: [],
        activeBranchId: 0,
        lastClearAt: null
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
      error: '',
      editingMessageId: null,
      branches: [],
      activeBranchId: 0,
      lastClearAt: null
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

        const [bestIdea, allIdeas, convs] = await Promise.all([
          readBestIdea(sessionDir),
          readAllIdeas(sessionDir),
          getIdeaConversations(currentSessionId)
        ])

        if (sessionIdRef.current !== currentSessionId) return

        if (!bestIdea) {
          setState(prev => ({ ...prev, error: 'best_idea 内容为空' }))
          return
        }

        const contextParts: string[] = []
        contextParts.push(`# 当前最佳 Idea\n\n${bestIdea}`)
        if (allIdeas.length > 0) {
          const ideasContent = allIdeas
            .map(idea => `## Idea ${idea.index}\n\n${idea.content}`)
            .join('\n\n')
          contextParts.push(`# 所有候选 Ideas\n\n${ideasContent}`)
        }
        contextRef.current = contextParts.join('\n\n---\n\n')

        let conversations = convs
        let currentConvId: number | null = null

        if (conversations.length === 0) {
          const newConvId = await createIdeaConversation(currentSessionId, '新对话')
          conversations = await getIdeaConversations(currentSessionId)
          currentConvId = newConvId
        } else {
          currentConvId = conversations[0].id!
        }

        // 加载当前对话的消息和分支信息
        const [messages, branches, activeBranchId] = await Promise.all([
          currentConvId ? getIdeaMessages(currentConvId) : Promise.resolve([]),
          currentConvId ? getIdeaConversationBranches(currentConvId) : Promise.resolve([]),
          currentConvId ? getIdeaActiveBranchId(currentConvId) : Promise.resolve(0)
        ])

        // 获取对话的 lastClearAt
        const currentConv = conversations.find(c => c.id === currentConvId)

        if (sessionIdRef.current !== currentSessionId) return

        setState(prev => ({
          ...prev,
          messages,
          conversations,
          currentConversationId: currentConvId,
          bestIdea,
          allIdeas,
          currentIdeaSlug: 'best_idea',
          error: '',
          branches,
          activeBranchId,
          lastClearAt: currentConv?.lastClearAt || null
        }))
      } catch (err) {
        console.error('加载会话内容失败:', err)
        if (sessionIdRef.current === session!.id!) {
          setState(prev => ({ ...prev, error: (err as Error).message }))
        }
      }
    }

    loadSessionContent()
  }, [session?.id])

  // 切换对话
  const switchConversation = useCallback(async (conversationId: number) => {
    if (conversationId === state.currentConversationId) return

    // 如果当前有正在进行的请求，注册为后台任务
    if (state.loading && state.currentConversationId && session) {
      backgroundTaskManager.registerIdeaTask(
        state.currentConversationId,
        session.id!,
        {
          userMessage: {
            content: '',
            timestamp: new Date()
          }
        }
      )
    }

    try {
      const [messages, branches, activeBranchId] = await Promise.all([
        getIdeaMessages(conversationId),
        getIdeaConversationBranches(conversationId),
        getIdeaActiveBranchId(conversationId)
      ])

      const conv = state.conversations.find(c => c.id === conversationId)

      setState(prev => ({
        ...prev,
        currentConversationId: conversationId,
        messages,
        branches,
        activeBranchId,
        lastClearAt: conv?.lastClearAt || null,
        editingMessageId: null,
        error: ''
      }))
    } catch (err) {
      console.error('切换对话失败:', err)
      setState(prev => ({ ...prev, error: '切换对话失败' }))
    }
  }, [state.currentConversationId, state.loading, state.conversations, session])

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
        messages: [],
        branches: [],
        activeBranchId: 0,
        lastClearAt: null,
        editingMessageId: null
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

      let newCurrentId: number | null = null
      if (conversations.length === 0) {
        newCurrentId = await createIdeaConversation(session.id!, '新对话')
        conversations = await getIdeaConversations(session.id!)
      } else if (conversationId === state.currentConversationId) {
        newCurrentId = conversations[0].id!
      } else {
        newCurrentId = state.currentConversationId
      }

      const [messages, branches, activeBranchId] = await Promise.all([
        newCurrentId ? getIdeaMessages(newCurrentId) : Promise.resolve([]),
        newCurrentId ? getIdeaConversationBranches(newCurrentId) : Promise.resolve([]),
        newCurrentId ? getIdeaActiveBranchId(newCurrentId) : Promise.resolve(0)
      ])

      const conv = conversations.find(c => c.id === newCurrentId)

      setState(prev => ({
        ...prev,
        conversations,
        currentConversationId: newCurrentId,
        messages,
        branches,
        activeBranchId,
        lastClearAt: conv?.lastClearAt || null,
        editingMessageId: null
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

  // 进入编辑模式
  const editMessage = useCallback((messageId: number) => {
    setState(prev => ({ ...prev, editingMessageId: messageId }))
  }, [])

  // 取消编辑
  const cancelEdit = useCallback(() => {
    setState(prev => ({ ...prev, editingMessageId: null }))
  }, [])

  // 发送消息（支持图片和编辑模式）
  const sendMessage = useCallback(async (
    content: string,
    images?: MessageImage[],
    editingId?: number
  ) => {
    if (!content.trim() || !session || state.loading || !state.currentConversationId) return

    if (!contextRef.current) {
      setState(prev => ({ ...prev, error: '正在加载上下文，请稍候' }))
      return
    }

    const conversationId = state.currentConversationId
    activeConversationIdRef.current = conversationId

    // 创建 AbortController
    abortControllerRef.current = new AbortController()

    setState(prev => ({
      ...prev,
      loading: true,
      error: '',
      streamingText: '',
      streamingThought: '',
      streamingStartTime: new Date(),
      editingMessageId: null
    }))

    try {
      // 如果是编辑模式，先删除该消息及之后的所有消息
      if (editingId) {
        await deleteIdeaMessagesAfter(conversationId, editingId)
        // 重新加载消息
        const updatedMessages = await getIdeaMessages(conversationId)
        setState(prev => ({ ...prev, messages: updatedMessages }))
      }

      const userMessage: IdeaMessage = {
        conversationId,
        role: 'user',
        content,
        timestamp: new Date(),
        images,
        branchId: state.activeBranchId || undefined
      }

      const savedUserMsgId = await saveIdeaMessage(userMessage)
      const savedUserMessage = { ...userMessage, id: savedUserMsgId }

      if (activeConversationIdRef.current !== conversationId) return

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, savedUserMessage]
      }))

      // 自动更新对话标题（第一条消息时）
      if (state.messages.length === 0 || editingId) {
        const title = content.substring(0, 30).trim() + (content.length > 30 ? '...' : '')
        await renameIdeaConversation(conversationId, title)
        const conversations = await getIdeaConversations(session.id!)
        setState(prev => ({ ...prev, conversations }))
      }

      // 构建历史消息，考虑 lastClearAt
      let historyMessages = state.messages
      if (state.lastClearAt) {
        historyMessages = historyMessages.filter(
          m => m.timestamp > state.lastClearAt!
        )
      }

      const history = historyMessages.slice(-20).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }))

      const mentionedPapersContent = await loadMentionedPapers(content)
      const fullContext = contextRef.current + mentionedPapersContent

      const generationStartTime = new Date()

      const result = await sendMessageToGemini(
        fullContext,
        content,
        history,
        images,
        (text) => {
          if (activeConversationIdRef.current === conversationId) {
            setState(prev => ({ ...prev, streamingText: text }))
          }
        },
        (thought) => {
          if (activeConversationIdRef.current === conversationId) {
            setState(prev => ({ ...prev, streamingThought: thought }))
          }
        },
        () => {},
        undefined,
        undefined,
        abortControllerRef.current.signal
      )

      const generationEndTime = new Date()

      const assistantMessage: IdeaMessage = {
        conversationId,
        role: 'assistant',
        content: result.content,
        timestamp: new Date(),
        thoughts: result.thoughts,
        thinkingTimeMs: result.thinkingTimeMs,
        branchId: state.activeBranchId || undefined,
        groundingMetadata: result.groundingMetadata,
        webSearchQueries: result.webSearchQueries,
        generationStartTime,
        generationEndTime
      }

      const savedAssistantMsgId = await saveIdeaMessage(assistantMessage)
      const savedAssistantMessage = { ...assistantMessage, id: savedAssistantMsgId }

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
      if (activeConversationIdRef.current === conversationId) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: err.message || '发送消息失败',
          streamingText: '',
          streamingThought: '',
          streamingStartTime: null
        }))
      }
    } finally {
      activeConversationIdRef.current = null
      abortControllerRef.current = null
    }
  }, [session, state.loading, state.messages, state.currentConversationId, state.activeBranchId, state.lastClearAt, loadMentionedPapers])

  // 重新生成回复
  const regenerateResponse = useCallback(async (aiMessageId: number) => {
    if (!session || state.loading || !state.currentConversationId) return

    const aiMessage = state.messages.find(m => m.id === aiMessageId)
    if (!aiMessage || aiMessage.role !== 'assistant') return

    // 找到这条 AI 消息之前的用户消息
    const aiIndex = state.messages.findIndex(m => m.id === aiMessageId)
    if (aiIndex <= 0) return

    const userMessage = state.messages[aiIndex - 1]
    if (userMessage.role !== 'user') return

    // 保存当前 AI 消息为历史版本
    await saveIdeaMessageVersion(aiMessage)

    // 删除 AI 消息及之后的所有消息
    await deleteIdeaMessagesAfter(state.currentConversationId, aiMessageId)

    // 重新加载消息
    const updatedMessages = await getIdeaMessages(state.currentConversationId)
    setState(prev => ({ ...prev, messages: updatedMessages }))

    // 重新发送用户消息
    await sendMessage(userMessage.content, userMessage.images)
  }, [session, state.loading, state.currentConversationId, state.messages, sendMessage])

  // 清空上下文（保留显示，但 AI 不再获取历史）
  const clearContext = useCallback(async () => {
    if (!state.currentConversationId) return

    try {
      const clearTime = await clearIdeaConversationContext(state.currentConversationId)
      setState(prev => ({ ...prev, lastClearAt: clearTime }))
    } catch (err) {
      console.error('清空上下文失败:', err)
      setState(prev => ({ ...prev, error: '清空上下文失败' }))
    }
  }, [state.currentConversationId])

  // 清空当前对话的消息（真正删除）
  const clearMessages = useCallback(async () => {
    if (state.currentConversationId) {
      await deleteIdeaMessages(state.currentConversationId)
    }
    setState(prev => ({ ...prev, messages: [], lastClearAt: null }))
  }, [state.currentConversationId])

  // 创建分支
  const createBranchFromMessage = useCallback(async (messageId: number) => {
    if (!state.currentConversationId) return

    try {
      const newBranchId = await createIdeaBranch(state.currentConversationId, messageId)

      // 重新加载分支信息
      const branches = await getIdeaConversationBranches(state.currentConversationId)

      setState(prev => ({
        ...prev,
        branches,
        activeBranchId: newBranchId
      }))

      return newBranchId
    } catch (err) {
      console.error('创建分支失败:', err)
      setState(prev => ({ ...prev, error: '创建分支失败' }))
    }
  }, [state.currentConversationId])

  // 切换分支
  const switchToBranch = useCallback(async (branchId: number) => {
    if (!state.currentConversationId) return

    try {
      await switchIdeaBranch(state.currentConversationId, branchId)

      // 重新加载分支消息
      const messages = await getIdeaBranchMessages(state.currentConversationId, branchId)

      setState(prev => ({
        ...prev,
        messages,
        activeBranchId: branchId
      }))
    } catch (err) {
      console.error('切换分支失败:', err)
      setState(prev => ({ ...prev, error: '切换分支失败' }))
    }
  }, [state.currentConversationId])

  // 检查消息是否有分支
  const checkMessageHasBranches = useCallback(async (messageId: number): Promise<boolean> => {
    if (!state.currentConversationId) return false
    return hasIdeaMessageBranches(state.currentConversationId, messageId)
  }, [state.currentConversationId])

  // 获取消息的分支列表
  const getMessageBranches = useCallback(async (messageId: number): Promise<number[]> => {
    if (!state.currentConversationId) return []
    return getIdeaBranchesFromMessage(state.currentConversationId, messageId)
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
    renameConversation,
    // 新增返回值
    editMessage,
    cancelEdit,
    regenerateResponse,
    clearContext,
    createBranchFromMessage,
    switchToBranch,
    checkMessageHasBranches,
    getMessageBranches
  }
}
