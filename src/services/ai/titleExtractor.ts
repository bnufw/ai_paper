import { getAPIKey } from '../storage/db'
import { GoogleGenAI } from '@google/genai'

/**
 * 从论文Markdown中提取标题
 * @param markdown 论文的Markdown内容
 * @returns 提取的标题，失败返回null
 */
export async function extractPaperTitle(markdown: string): Promise<string | null> {
  try {
    const apiKey = await getAPIKey('gemini')
    if (!apiKey) {
      console.warn('未配置Gemini API Key，跳过AI标题识别')
      return null
    }

    // 截取前2000字符（包含标题的部分）
    const excerpt = markdown.substring(0, 2000)

    const ai = new GoogleGenAI({ apiKey })

    // 创建聊天会话
    const chat = ai.chats.create({
      model: 'gemini-2.0-flash-exp',  // 快速模型
      config: {
        temperature: 0.1,  // 低温度保证准确性
        maxOutputTokens: 100
      }
    })

    const prompt = `请从以下学术论文的开头部分提取论文标题。只返回标题文本，不要包含任何其他内容。

论文内容：
${excerpt}

注意：
- 只返回标题，不要返回副标题、作者、机构等信息
- 标题应该简洁明确
- 如果无法确定标题，返回"Untitled Paper"`

    const result = await chat.sendMessage({
      message: [{ text: prompt }]
    })

    const title = result.text?.trim()

    // 验证标题有效性
    if (title && title !== 'Untitled Paper' && title.length > 5 && title.length < 200) {
      return title
    }

    return null
  } catch (error) {
    console.error('AI标题提取失败:', error)
    return null
  }
}
