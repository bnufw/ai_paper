import { GoogleGenAI } from '@google/genai'
import { getAPIKey, getGeminiSettings, type MessageImage } from '../storage/db'
import { withRetry } from './retryUtils'

/**
 * 使用Gemini API进行对话
 * @param paperContext 论文内容作为上下文（当 cachedContentName 有效时可为空）
 * @param userMessage 用户消息
 * @param history 对话历史
 * @param images 用户上传的图片(可选)
 * @param onStream 流式输出回调
 * @param onThought 思考过程回调
 * @param onGenerationStart 生成开始回调
 * @param cachedContentName 缓存内容名称（优先使用缓存）
 * @returns AI回复及元数据
 */
export async function sendMessageToGemini(
  paperContext: string,
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  images?: MessageImage[],
  onStream?: (text: string) => void,
  onThought?: (thought: string) => void,
  onGenerationStart?: (startTime: Date) => void,
  cachedContentName?: string | null
): Promise<{
  content: string
  thoughts?: string
  thinkingTimeMs?: number
  generationStartTime?: Date
  generationEndTime?: Date
  groundingMetadata?: any
  webSearchQueries?: string[]
}> {
  const apiKey = await getAPIKey('gemini')

  if (!apiKey) {
    throw new Error('未配置Gemini API Key，请先在设置中配置')
  }

  const settings = await getGeminiSettings()
  const ai = new GoogleGenAI({ apiKey })

  // 构建生成配置
  const config: any = {
    temperature: settings.temperature
  }

  // 使用缓存内容（优先级最高）
  if (cachedContentName) {
    config.cachedContent = cachedContentName
  }

  // 添加联网搜索工具
  if (settings.useSearch) {
    config.tools = [{ googleSearch: {} }]
  }

  // 配置思考模式：根据模型类型选择thinkingBudget或thinkingLevel
  // Gemini 3.x 使用 thinkingLevel，Gemini 2.5 使用 thinkingBudget
  if (settings.model.includes('gemini-3')) {
    // Gemini 3 Pro使用thinkingLevel（小写值）
    if (settings.thinkingLevel) {
      config.thinkingConfig = {
        thinkingLevel: settings.thinkingLevel.toLowerCase(), // 'LOW' -> 'low', 'HIGH' -> 'high'
        includeThoughts: settings.showThoughts
      }
    }
  } else if (settings.model.includes('2.5')) {
    // Gemini 2.5 Pro使用thinkingBudget
    if (settings.thinkingBudget > 0) {
      config.thinkingConfig = {
        thinkingBudget: settings.thinkingBudget,
        includeThoughts: settings.showThoughts
      }
    }
  }

  // 构建对话历史
  // 使用缓存时，论文内容已在缓存中，只需传递后续对话历史
  const chatHistory = cachedContentName
    ? history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }))
    : [
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

  // 创建聊天会话
  const chat = ai.chats.create({
    model: settings.model,
    config,
    history: chatHistory as any
  })

  // 构建用户消息parts(支持多模态)
  const userParts: any[] = []

  // 添加文本内容
  if (userMessage.trim()) {
    userParts.push({ text: userMessage })
  }

  // 添加图片内容
  if (images && images.length > 0) {
    for (const img of images) {
      userParts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data
        }
      })
    }
  }

  let thoughts = ''
  let thinkingEndTime: number | undefined
  let generationStartTime: Date | undefined
  let generationEndTime: Date | undefined
  let groundingMetadata: any = undefined
  let webSearchQueries: string[] = []

  try {
    // 流式输出
    if (settings.streaming && onStream) {
      // 标记生成开始
      generationStartTime = new Date()
      if (onGenerationStart) {
        onGenerationStart(generationStartTime)
      }

      // 带 503 重试的流式请求
      const stream = await withRetry(
        () => chat.sendMessageStream({ message: userParts }),
        {
          onRetry: () => {
            // 重试时重置流式状态
            thoughts = ''
            thinkingEndTime = undefined
          }
        }
      )

      let fullText = ''

      for await (const chunk of stream) {
        // 处理候选内容
        const candidate = chunk.candidates?.[0]

        if (candidate) {
          // 提取grounding元数据
          if (candidate.groundingMetadata) {
            groundingMetadata = candidate.groundingMetadata

            // 提取搜索查询
            if (groundingMetadata.webSearchQueries) {
              webSearchQueries = groundingMetadata.webSearchQueries
            }
          }

          // 处理内容parts
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              // 检查是否为思考内容
              if (part.thought) {
                thoughts += part.text || ''
                if (onThought) {
                  onThought(thoughts)
                }
                // 记录思考结束时间（每次收到思考内容都更新）
                thinkingEndTime = Date.now()
              } else {
                // 正常内容
                const chunkText = part.text || ''
                fullText += chunkText
                onStream(fullText)
              }
            }
          }
        }
      }

      generationEndTime = new Date()

      // 思考时间 = 从生成开始到最后一个思考内容的时间差
      const thinkingTimeMs = generationStartTime && thinkingEndTime
        ? thinkingEndTime - generationStartTime.getTime()
        : undefined

      return {
        content: fullText,
        thoughts: thoughts || undefined,
        thinkingTimeMs,
        generationStartTime,
        generationEndTime,
        groundingMetadata,
        webSearchQueries: webSearchQueries.length > 0 ? webSearchQueries : undefined
      }
    }
    // 非流式输出
    else {
      generationStartTime = new Date()
      if (onGenerationStart) {
        onGenerationStart(generationStartTime)
      }

      // 带 503 重试的非流式请求
      const result = await withRetry(
        () => chat.sendMessage({ message: userParts }),
        {
          onRetry: () => {
            // 重试时重置状态
            thoughts = ''
            thinkingEndTime = undefined
          }
        }
      )

      generationEndTime = new Date()

      // 提取grounding元数据
      const candidate = result.candidates?.[0]
      if (candidate?.groundingMetadata) {
        groundingMetadata = candidate.groundingMetadata
        if (groundingMetadata.webSearchQueries) {
          webSearchQueries = groundingMetadata.webSearchQueries
        }
      }

      // 分离思考内容和正常内容
      let contentText = ''
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.thought) {
            thoughts += part.text || ''
            thinkingEndTime = Date.now()
          } else {
            contentText += part.text || ''
          }
        }
      }

      if (!contentText) {
        contentText = result.text || ''
      }

      // 思考时间 = 从生成开始到最后一个思考内容的时间差
      const thinkingTimeMs = generationStartTime && thinkingEndTime
        ? thinkingEndTime - generationStartTime.getTime()
        : undefined

      return {
        content: contentText,
        thoughts: thoughts || undefined,
        thinkingTimeMs,
        generationStartTime,
        generationEndTime,
        groundingMetadata,
        webSearchQueries: webSearchQueries.length > 0 ? webSearchQueries : undefined
      }
    }
  } catch (error: any) {
    // 处理 API 错误
    // 检查是否为缓存相关错误（404 NOT_FOUND 或 INVALID_ARGUMENT）
    const errorMessage = error.message || ''
    const isCacheError = cachedContentName && (
      error.status === 404 ||
      errorMessage.includes('NOT_FOUND') ||
      errorMessage.includes('cached') ||
      errorMessage.includes('INVALID_ARGUMENT')
    )

    if (isCacheError) {
      // 缓存失效错误，抛出特殊错误让调用方处理
      const cacheError = new Error(`缓存失效: ${errorMessage}`)
      ;(cacheError as any).isCacheError = true
      throw cacheError
    }

    if (error.status) {
      throw new Error(`API请求失败 (${error.status}): ${error.statusText || error.message || '未知错误'}`)
    } else if (errorMessage.includes('fetch')) {
      throw new Error('网络连接失败')
    }
    throw error
  }
}
