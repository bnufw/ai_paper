import OpenAI from 'openai'
import { getAPIKey } from '../storage/db'

/**
 * 使用OpenAI API进行对话
 * @param paperContext 论文内容作为上下文
 * @param userMessage 用户消息
 * @param history 对话历史
 * @returns AI回复
 */
export async function sendMessageToOpenAI(
  paperContext: string,
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const apiKey = await getAPIKey('openai')

  if (!apiKey) {
    throw new Error('未配置OpenAI API Key，请先在设置中配置')
  }

  const openai = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true // 纯前端应用需要此选项
  })

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: `你是一个学术论文助手。以下是论文内容:\n\n${paperContext}`
      },
      ...history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: userMessage
      }
    ]
  })

  return response.choices[0].message.content || ''
}
