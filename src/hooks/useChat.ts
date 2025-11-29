import { useState, useEffect } from 'react'
import { db, type Message, type Conversation, deleteConversation as dbDeleteConversation, renameConversation as dbRenameConversation, exportConversation as dbExportConversation } from '../services/storage/db'
import { sendMessageToGemini } from '../services/ai/geminiClient'

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
  const sendMessage = async (content: string) => {
    if (!content.trim()) return

    setLoading(true)
    setError('')
    setStreamingText('')

    try {
      // 如果没有当前对话，创建一个
      let conversationId = currentConversationId
      if (!conversationId) {
        const now = new Date()
        conversationId = await db.conversations.add({
          paperId,
          title: content.substring(0, 30).trim() + (content.length > 30 ? '...' : ''),
          createdAt: now,
          updatedAt: now
        })
        setCurrentConversationId(conversationId)
      } else {
        // 如果是对话的第一条消息,用它更新标题
        const existingMessages = await db.messages
          .where('conversationId')
          .equals(conversationId)
          .count()
        
        if (existingMessages === 0) {
          await db.conversations.update(conversationId, {
            title: content.substring(0, 30).trim() + (content.length > 30 ? '...' : '')
          })
        }
      }

      // 获取论文内容
      const paper = await db.papers.get(paperId)
      if (!paper) {
        throw new Error('论文不存在')
      }

      // 先保存用户消息
      const userTimestamp = new Date()
      await db.messages.add({
        conversationId,
        role: 'user',
        content,
        timestamp: userTimestamp
      })

      // 刷新消息列表显示用户消息
      let updatedMessages = await db.messages
        .where('conversationId')
        .equals(conversationId)
        .sortBy('timestamp')
      setMessages(updatedMessages)

      // 构建历史消息（只保留最近10轮）
      const recentMessages = messages.slice(-20)
      const history = recentMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      // 调用AI (支持流式输出)
      const response = await sendMessageToGemini(
        paper.markdown, 
        content, 
        history,
        (text) => {
          // 流式输出回调
          setStreamingText(text)
        }
      )

      // 清空流式文本
      setStreamingText('')

      // 保存AI回复
      await db.messages.add({
        conversationId,
        role: 'assistant',
        content: response,
        timestamp: new Date()
      })

      // 更新对话
      await db.conversations.update(conversationId, {
        updatedAt: new Date()
      })

      // 刷新消息列表
      updatedMessages = await db.messages
        .where('conversationId')
        .equals(conversationId)
        .sortBy('timestamp')

      setMessages(updatedMessages)

    } catch (err) {
      console.error('发送消息失败:', err)
      setError((err as Error).message)
      setStreamingText('')
    } finally {
      setLoading(false)
    }
  }

  return {
    messages,
    conversations,
    currentConversationId,
    loading,
    error,
    streamingText,
    sendMessage,
    createNewConversation,
    setCurrentConversationId,
    deleteConversation,
    renameConversation,
    exportConversation
  }
}
