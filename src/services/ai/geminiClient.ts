import { GoogleGenerativeAI } from '@google/generative-ai'
import { getAPIKey, getGeminiSettings } from '../storage/db'

/**
 * 使用Gemini API进行对话
 * @param paperContext 论文内容作为上下文
 * @param userMessage 用户消息
 * @param history 对话历史
 * @param onStream 流式输出回调
 * @param onThought 思考过程回调
 * @param onGenerationStart 生成开始回调
 * @returns AI回复及元数据
 */
export async function sendMessageToGemini(
  paperContext: string,
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  onStream?: (text: string) => void,
  onThought?: (thought: string) => void,
  onGenerationStart?: (startTime: Date) => void
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
  const genAI = new GoogleGenerativeAI(apiKey)
  
  // 模型支持思考模式的列表
  const MODELS_SUPPORTING_THINKING_BUDGET = ['gemini-2.5-pro']
  const MODELS_SUPPORTING_THINKING_LEVEL = ['gemini-3-pro-preview']
  
  // 构建模型配置(包括tools)
  const modelConfig: any = {
    model: settings.model === 'gemini-3-pro-preview' ? 'gemini-3-pro-preview' : 'gemini-2.5-pro'
  }

  // 添加联网搜索工具(在模型级别配置)
  if (settings.useSearch) {
    modelConfig.tools = [{ googleSearch: {} }]
  }

  const model = genAI.getGenerativeModel(modelConfig)

  // 构建对话配置(temperature等生成参数)
  const generationConfig: any = {
    temperature: settings.temperature
  }

  // 配置思考模式：根据模型类型选择thinkingBudget或thinkingLevel
  if (MODELS_SUPPORTING_THINKING_LEVEL.includes(settings.model)) {
    // Gemini 3 Pro使用thinkingLevel
    if (settings.thinkingLevel) {
      generationConfig.thinkingConfig = {
        thinkingLevel: settings.thinkingLevel,
        includeThoughts: settings.showThoughts
      }
    }
  } else if (MODELS_SUPPORTING_THINKING_BUDGET.includes(settings.model)) {
    // Gemini 2.5 Pro使用thinkingBudget
    if (settings.thinkingBudget > 0) {
      generationConfig.thinkingConfig = {
        thinkingBudget: settings.thinkingBudget,
        includeThoughts: settings.showThoughts
      }
    }
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
    generationConfig
  })

  let thoughts = ''
  let thinkingEndTime: number | undefined
  let generationStartTime: Date | undefined
  let generationEndTime: Date | undefined
  let groundingMetadata: any = undefined
  let webSearchQueries: string[] = []

  // 流式输出
  if (settings.streaming && onStream) {
    const result = await chat.sendMessageStream(userMessage)
    let fullText = ''
    
    // 标记生成开始
    generationStartTime = new Date()
    if (onGenerationStart) {
      onGenerationStart(generationStartTime)
    }
    
    for await (const chunk of result.stream) {
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
            // @ts-ignore - 检查是否为思考内容
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
    
    const result = await chat.sendMessage(userMessage)
    
    generationEndTime = new Date()
    
    // 提取grounding元数据
    const candidate = result.response.candidates?.[0]
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
        // @ts-ignore
        if (part.thought) {
          thoughts += part.text || ''
          thinkingEndTime = Date.now()
        } else {
          contentText += part.text || ''
        }
      }
    }

    if (!contentText) {
      contentText = result.response.text()
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
}
