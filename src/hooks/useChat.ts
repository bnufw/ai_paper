import { useState, useEffect, useRef } from 'react'
import { db, type Message, type Conversation, type MessageImage, deleteConversation as dbDeleteConversation, renameConversation as dbRenameConversation, exportConversation as dbExportConversation, getPaperMarkdown, deleteMessagesAfter, getGeminiSettings } from '../services/storage/db'
import { sendMessageToGemini } from '../services/ai/geminiClient'
import { loadDomainKnowledge } from '../services/knowledge/domainKnowledgeService'
import { getOrCreatePaperCache, refreshCacheTTL, invalidateCache } from '../services/ai/cacheService'

// 引用解析正则
const MENTION_PATTERN = /@\[([^\]]+)\]\(paperId:(\d+)\)/g
// 领域知识引用（不使用 g 标志避免 lastIndex 问题）
const DOMAIN_KNOWLEDGE_PATTERN = /@领域知识/

/**
 * 解析消息中的论文引用
 */
function parseMentions(content: string): { paperId: number; title: string }[] {
  const mentions: { paperId: number; title: string }[] = []
  let match
  const regex = new RegExp(MENTION_PATTERN)
  
  while ((match = regex.exec(content)) !== null) {
    mentions.push({
      title: match[1],
      paperId: parseInt(match[2])
    })
  }
  
  return mentions
}

/**
 * AI对话Hook
 */
export function useChat(paperId: number) {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [streamingThought, setStreamingThought] = useState('')
  const [streamingStartTime, setStreamingStartTime] = useState<Date | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)

  // 缓存状态
  const cacheNameRef = useRef<string | null>(null)
  const cacheInitializedRef = useRef(false)

  // 刷新消息列表
  const refreshMessages = async (conversationId: number) => {
    const msgs = await db.messages
      .where('conversationId')
      .equals(conversationId)
      .sortBy('timestamp')
    setMessages(msgs)
  }

  // 准备对话（获取或创建）
  const prepareConversation = async (content: string, editingId?: number): Promise<number> => {
    let convId = currentConversationId
    if (!convId) {
      const now = new Date()
      convId = await db.conversations.add({
        paperId,
        title: content.substring(0, 30).trim() + (content.length > 30 ? '...' : ''),
        createdAt: now,
        updatedAt: now
      })
      setCurrentConversationId(convId)
    } else if (!editingId) {
      // 非编辑模式下，检查是否需要更新标题
      const msgCount = await db.messages
        .where('conversationId')
        .equals(convId)
        .count()
      if (msgCount === 0) {
        await db.conversations.update(convId, {
          title: content.substring(0, 30).trim() + (content.length > 30 ? '...' : '')
        })
      }
    }
    return convId
  }

  // 论文切换时重置缓存状态
  useEffect(() => {
    cacheNameRef.current = null
    cacheInitializedRef.current = false
  }, [paperId])

  // 加载对话列表
  useEffect(() => {
    async function loadConversations() {
      const convs = await db.conversations
        .where('paperId')
        .equals(paperId)
        .reverse()
        .sortBy('createdAt')

      setConversations(convs)

      // 自动选择第一个对话
      if (convs.length > 0 && !currentConversationId) {
        setCurrentConversationId(convs[0].id!)
      }
    }

    loadConversations()
  }, [paperId, currentConversationId])

  // 加载当前对话的消息
  useEffect(() => {
    if (!currentConversationId) {
      setMessages([])
      return
    }

    async function loadMessages() {
      const msgs = await db.messages
        .where('conversationId')
        .equals(currentConversationId!)
        .sortBy('timestamp')

      setMessages(msgs)
    }

    loadMessages()
  }, [currentConversationId])

  /**
   * 创建新对话
   */
  const createNewConversation = async () => {
    const now = new Date()
    const convId = await db.conversations.add({
      paperId,
      title: '新对话',
      createdAt: now,
      updatedAt: now
    })

    setCurrentConversationId(convId)
    setMessages([])

    // 刷新对话列表
    const convs = await db.conversations
      .where('paperId')
      .equals(paperId)
      .reverse()
      .sortBy('createdAt')
    setConversations(convs)
  }

  /**
   * 删除对话
   */
  const deleteConversation = async (conversationId: number) => {
    try {
      await dbDeleteConversation(conversationId)

      // 刷新对话列表
      const convs = await db.conversations
        .where('paperId')
        .equals(paperId)
        .reverse()
        .sortBy('createdAt')
      setConversations(convs)

      // 如果删除的是当前对话,切换到第一个对话或null
      if (conversationId === currentConversationId) {
        setCurrentConversationId(convs.length > 0 ? convs[0].id! : null)
      }
    } catch (err) {
      console.error('删除对话失败:', err)
      throw new Error('删除对话失败')
    }
  }

  /**
   * 重命名对话
   */
  const renameConversation = async (conversationId: number, newTitle: string) => {
    if (!newTitle.trim()) {
      throw new Error('标题不能为空')
    }

    try {
      await dbRenameConversation(conversationId, newTitle)

      // 刷新对话列表
      const convs = await db.conversations
        .where('paperId')
        .equals(paperId)
        .reverse()
        .sortBy('createdAt')
      setConversations(convs)
    } catch (err) {
      console.error('重命名对话失败:', err)
      throw new Error('重命名对话失败')
    }
  }

  /**
   * 导出对话
   */
  const exportConversation = async (conversationId: number) => {
    try {
      const markdown = await dbExportConversation(conversationId)
      const conversation = await db.conversations.get(conversationId)
      
      // 触发下载
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${conversation?.title || '对话'}_${new Date().toISOString().split('T')[0]}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('导出对话失败:', err)
      throw new Error('导出对话失败')
    }
  }

  /**
   * 发送消息
   */
  const sendMessage = async (content: string, images?: MessageImage[], editingId?: number) => {
    if (!content.trim() && (!images || images.length === 0)) return

    // 立即更新UI状态，让用户感知到响应
    setLoading(true)
    setError('')
    setStreamingText('')
    setStreamingThought('')
    setStreamingStartTime(new Date()) // 立即设置，不等待API

    try {
      // 解析引用（同步操作，很快）
      const mentions = parseMentions(content)
      if (mentions.length > 3) {
        throw new Error('单条消息最多引用3篇论文')
      }

      // 检查是否引用了领域知识
      const hasDomainKnowledgeRef = DOMAIN_KNOWLEDGE_PATTERN.test(content)

      // 并行执行：获取论文 + 准备对话ID + 获取引用内容 + 获取领域知识
      const [paper, conversationId, mentionContents, domainKnowledge] = await Promise.all([
        db.papers.get(paperId),
        prepareConversation(content, editingId),
        mentions.length > 0
          ? Promise.all(mentions.map(async (m) => {
              try {
                const markdown = await getPaperMarkdown(m.paperId)
                return `\n\n[引用论文: ${m.title}]\n${markdown}\n[/引用论文]\n`
              } catch (err) {
                console.error(`读取引用论文失败 (ID: ${m.paperId}):`, err)
                return `\n\n[引用论文: ${m.title}]\n[无法读取论文内容]\n[/引用论文]\n`
              }
            }))
          : Promise.resolve([]),
        hasDomainKnowledgeRef
          ? (async () => {
              const p = await db.papers.get(paperId)
              if (p?.groupId) {
                const group = await db.groups.get(p.groupId)
                if (group) {
                  return await loadDomainKnowledge(group.name)
                }
              }
              return null
            })()
          : Promise.resolve(null)
      ])

      if (!paper) {
        throw new Error('论文不存在')
      }

      // 构建上下文
      let contextWithMentions = paper.markdown

      // 添加领域知识
      if (domainKnowledge) {
        contextWithMentions += `\n\n---\n## 领域知识\n${domainKnowledge}\n---`
      }

      // 添加引用论文
      if (mentionContents.length > 0) {
        contextWithMentions += mentionContents.join('')
      }

      // 获取历史消息（用于构建对话上下文）
      const existingMessages = await db.messages
        .where('conversationId')
        .equals(conversationId)
        .sortBy('timestamp')

      let messagesForHistory = existingMessages
      if (editingId) {
        const editIndex = existingMessages.findIndex(m => m.id === editingId)
        if (editIndex !== -1) {
          messagesForHistory = existingMessages.slice(0, editIndex)
        }
      }

      // 构建历史消息（只保留最近10轮）
      const recentMessages = messagesForHistory.slice(-20)
      const history = recentMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      // 异步保存用户消息（不阻塞API调用）
      const userTimestamp = new Date()
      const saveUserMessagePromise = !editingId
        ? db.messages.add({
            conversationId,
            role: 'user',
            content,
            images,
            timestamp: userTimestamp
          }).then(() => refreshMessages(conversationId))
        : Promise.resolve()

      // 乐观更新：立即显示用户消息
      if (!editingId) {
        setMessages([...existingMessages, {
          conversationId,
          role: 'user',
          content,
          images,
          timestamp: userTimestamp
        } as Message])
      }

      // 获取或创建缓存（仅在没有额外引用时使用缓存）
      // 有引用论文或领域知识时，上下文会变化，不使用缓存
      const hasExtraContext = mentionContents.length > 0 || domainKnowledge
      let cacheName: string | null = null

      if (!hasExtraContext) {
        const settings = await getGeminiSettings()
        // 每次都调用 getOrCreatePaperCache，它内部会检查缓存有效性（TTL/模型）
        // 有效则复用，无效则自动重建
        cacheName = await getOrCreatePaperCache(paperId, paper.markdown, settings.model)
        cacheNameRef.current = cacheName
        cacheInitializedRef.current = !!cacheName
      } else {
        // 有额外引用时，后台刷新缓存 TTL 以防长时间不用导致过期
        if (cacheNameRef.current) {
          refreshCacheTTL(paperId).catch(() => {})
        }
      }

      // 调用AI（支持缓存错误自愈重试）
      let result
      try {
        result = await sendMessageToGemini(
          contextWithMentions,
          content,
          history,
          images,
          (text) => setStreamingText(text),
          (thought) => setStreamingThought(thought),
          () => {}, // 已经提前设置了startTime
          cacheName
        )
      } catch (err: any) {
        // 检查是否为缓存错误，如果是则失效缓存并用传统模式重试
        if (err.isCacheError && cacheName) {
          console.log('[Chat] 缓存失效，使用传统模式重试')
          await invalidateCache(paperId)
          cacheNameRef.current = null
          cacheInitializedRef.current = false
          // 重置流式状态
          setStreamingText('')
          setStreamingThought('')
          // 不使用缓存重试
          result = await sendMessageToGemini(
            contextWithMentions,
            content,
            history,
            images,
            (text) => setStreamingText(text),
            (thought) => setStreamingThought(thought),
            () => {},
            null
          )
        } else {
          throw err
        }
      }

      // 确保用户消息已保存
      await saveUserMessagePromise

      // 清空流式文本和时间
      setStreamingText('')
      setStreamingThought('')
      setStreamingStartTime(null)

      // AI调用成功后，如果是编辑模式，先删除旧消息再保存新消息
      if (editingId) {
        await deleteMessagesAfter(conversationId, editingId)
        // 编辑模式下保存新用户消息
        await db.messages.add({
          conversationId,
          role: 'user',
          content,
          images,
          timestamp: userTimestamp
        })
      }

      // 保存AI回复
      await db.messages.add({
        conversationId,
        role: 'assistant',
        content: result.content,
        timestamp: new Date(),
        thoughts: result.thoughts,
        thinkingTimeMs: result.thinkingTimeMs,
        generationStartTime: result.generationStartTime,
        generationEndTime: result.generationEndTime,
        groundingMetadata: result.groundingMetadata,
        webSearchQueries: result.webSearchQueries
      })

      // 更新对话
      await db.conversations.update(conversationId, {
        updatedAt: new Date()
      })

      // 刷新对话列表（确保自动命名后标题更新到UI）
      const updatedConvs = await db.conversations
        .where('paperId')
        .equals(paperId)
        .reverse()
        .sortBy('createdAt')
      setConversations(updatedConvs)

      // 刷新消息列表
      const finalMessages = await db.messages
        .where('conversationId')
        .equals(conversationId)
        .sortBy('timestamp')

      setMessages(finalMessages)

      // 清除编辑状态
      if (editingId) {
        setEditingMessageId(null)
      }

    } catch (err) {
      console.error('发送消息失败:', err)
      setError((err as Error).message)
      setStreamingText('')
      setStreamingThought('')
      setStreamingStartTime(null)
    } finally {
      setLoading(false)
    }
  }

  /**
   * 编辑消息
   */
  const editMessage = (messageId: number) => {
    const message = messages.find(m => m.id === messageId)
    if (message && message.role === 'user') {
      setEditingMessageId(messageId)
      return {
        content: message.content,
        images: message.images || []
      }
    }
    return null
  }

  /**
   * 取消编辑
   */
  const cancelEdit = () => {
    setEditingMessageId(null)
  }

  /**
   * 标记消息已添加到笔记（更新本地状态）
   */
  const markAsAddedToNote = (messageId: number) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, addedToNote: true } : msg
    ))
  }

  return {
    messages,
    conversations,
    currentConversationId,
    loading,
    error,
    streamingText,
    streamingThought,
    streamingStartTime,
    editingMessageId,
    sendMessage,
    editMessage,
    cancelEdit,
    createNewConversation,
    setCurrentConversationId,
    deleteConversation,
    renameConversation,
    exportConversation,
    markAsAddedToNote
  }
}
