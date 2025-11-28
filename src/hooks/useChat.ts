import { useState, useEffect } from 'react'
import { db, type Message, type Conversation } from '../services/storage/db'
import { sendMessageToGemini } from '../services/ai/geminiClient'
import { sendMessageToOpenAI } from '../services/ai/openaiClient'

/**
 * AI对话Hook
 */
export function useChat(paperId: number) {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      title: `对话 ${conversations.length + 1}`,
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
   * 发送消息
   */
  const sendMessage = async (
    content: string,
    aiProvider: 'gemini' | 'openai' = 'gemini'
  ) => {
    if (!content.trim()) return

    setLoading(true)
    setError('')

    try {
      // 如果没有当前对话，创建一个
      let conversationId = currentConversationId
      if (!conversationId) {
        const now = new Date()
        conversationId = await db.conversations.add({
          paperId,
          title: content.substring(0, 30) + '...',
          createdAt: now,
          updatedAt: now
        })
        setCurrentConversationId(conversationId)
      }

      // 获取论文内容
      const paper = await db.papers.get(paperId)
      if (!paper) {
        throw new Error('论文不存在')
      }

      // 构建历史消息（只保留最近10轮）
      const recentMessages = messages.slice(-20)
      const history = recentMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      // 调用AI
      let response: string
      if (aiProvider === 'gemini') {
        response = await sendMessageToGemini(paper.markdown, content, history)
      } else {
        response = await sendMessageToOpenAI(paper.markdown, content, history)
      }

      // 保存消息
      const now = new Date()
      await db.messages.bulkAdd([
        {
          conversationId,
          role: 'user',
          content,
          timestamp: now
        },
        {
          conversationId,
          role: 'assistant',
          content: response,
          timestamp: new Date(now.getTime() + 1) // 确保顺序
        }
      ])

      // 更新对话
      await db.conversations.update(conversationId, {
        updatedAt: new Date()
      })

      // 刷新消息列表
      const updatedMessages = await db.messages
        .where('conversationId')
        .equals(conversationId)
        .sortBy('timestamp')

      setMessages(updatedMessages)

    } catch (err) {
      console.error('发送消息失败:', err)
      setError((err as Error).message)
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
    sendMessage,
    createNewConversation,
    setCurrentConversationId
  }
}
