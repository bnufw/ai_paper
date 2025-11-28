import { GoogleGenerativeAI } from '@google/generative-ai'
import { getAPIKey } from '../storage/db'

/**
 * 使用Gemini API进行对话
 * @param paperContext 论文内容作为上下文
 * @param userMessage 用户消息
 * @param history 对话历史
 * @returns AI回复
 */
export async function sendMessageToGemini(
  paperContext: string,
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const apiKey = await getAPIKey('gemini')

  if (!apiKey) {
    throw new Error('未配置Gemini API Key，请先在设置中配置')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

  // 构建对话历史
  const chatHistory = [
    {
      role: 'user',
      parts: [{ text: `这是一篇学术论文的内容:\n\n${paperContext}\n\n请基于这篇论文回答我的问题。` }]
    },
    {
      role: 'model',
      parts: [{ text: '好的，我已经阅读了这篇论文，请问有什么问题？' }]
    },
    ...history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }))
  ]

  const chat = model.startChat({
    history: chatHistory as any
  })

  const result = await chat.sendMessage(userMessage)
  return result.response.text()
}
