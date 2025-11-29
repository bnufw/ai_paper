import { GoogleGenerativeAI } from '@google/generative-ai'
import { getAPIKey, getGeminiSettings } from '../storage/db'

/**
 * 使用Gemini API进行对话
 * @param paperContext 论文内容作为上下文
 * @param userMessage 用户消息
 * @param history 对话历史
 * @param onStream 流式输出回调
 * @returns AI回复
 */
export async function sendMessageToGemini(
  paperContext: string,
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  onStream?: (text: string) => void
): Promise<string> {
  const apiKey = await getAPIKey('gemini')

  if (!apiKey) {
    throw new Error('未配置Gemini API Key，请先在设置中配置')
  }

  const settings = await getGeminiSettings()
  const genAI = new GoogleGenerativeAI(apiKey)
  
  // 根据设置选择模型
  const model = genAI.getGenerativeModel({ 
    model: settings.model === 'gemini-3-pro-preview' ? 'gemini-3-pro-preview' : 'gemini-2.5-pro'
  })

  // 构建配置对象
  const config: any = {
    temperature: settings.temperature
  }

  // 添加联网搜索工具(tools 应该在 config 根级别,而不是 generationConfig 中)
  if (settings.useSearch) {
    config.tools = [{ googleSearch: {} }]
  }

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
    history: chatHistory as any,
    config
  })

  // 流式输出
  if (settings.streaming && onStream) {
    const result = await chat.sendMessageStream(userMessage)
    let fullText = ''
    
    for await (const chunk of result.stream) {
      const chunkText = chunk.text()
      fullText += chunkText
      onStream(fullText)
    }
    
    return fullText
  } 
  // 非流式输出
  else {
    const result = await chat.sendMessage(userMessage)
    return result.response.text()
  }
}
