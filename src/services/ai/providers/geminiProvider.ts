/**
 * Gemini Provider - Google AI 模型调用
 * 复用现有 geminiClient.ts 的逻辑，适配工作流场景
 */

import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from '@google/generative-ai'
import type { GenerationConfig } from '@google/generative-ai'
import { getAPIKey } from '../../storage/db'
import type { LLMRequest, LLMResponse } from '../../../types/idea'

/** 扩展的生成配置，包含思考模式 */
interface ExtendedGenerationConfig extends GenerationConfig {
  thinkingConfig?: {
    thinkingBudget: number
    includeThoughts?: boolean
  }
}

/**
 * 调用 Gemini 模型
 */
export async function callGemini(request: LLMRequest): Promise<LLMResponse> {
  const apiKey = await getAPIKey('gemini')
  if (!apiKey) {
    return { content: '', error: '未配置 Gemini API Key' }
  }

  try {
    // 创建客户端
    const genAI = new GoogleGenerativeAI(apiKey)

    // 获取模型
    const model = genAI.getGenerativeModel({ model: request.model })

    // 生成配置
    const generationConfig: ExtendedGenerationConfig = {}

    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature
    }

    if (request.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = request.maxTokens
    }

    // 思考模式配置（仅 Gemini 2.5 Pro 支持）
    if (request.thinkingConfig && request.model.includes('2.5')) {
      const budget = request.thinkingConfig.thinkingBudget
      if (budget !== undefined && budget !== 0) {
        generationConfig.thinkingConfig = {
          thinkingBudget: budget,
          includeThoughts: request.thinkingConfig.includeThoughts ?? false
        }
      }
    }

    // 构建消息
    const contents = [
      {
        role: 'user',
        parts: [{ text: request.systemPrompt + '\n\n' + request.userMessage }]
      }
    ]

    // 调用 API
    const result = await model.generateContent({
      contents,
      generationConfig
    })

    // 检查是否被取消
    if (request.signal?.aborted) {
      return { content: '', error: '请求已取消' }
    }

    // 解析响应
    const response = result.response
    const candidate = response.candidates?.[0]

    let content = ''
    let thinkingContent = ''

    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        // @ts-ignore - 检查是否为思考内容
        if (part.thought) {
          thinkingContent += part.text || ''
        } else {
          content += part.text || ''
        }
      }
    }

    if (!content) {
      content = response.text()
    }

    return {
      content,
      thinkingContent: thinkingContent || undefined
    }
  } catch (error) {
    if (request.signal?.aborted) {
      return { content: '', error: '请求已取消' }
    }

    if (error instanceof GoogleGenerativeAIFetchError) {
      const status = error.status ? ` (${error.status})` : ''
      return { content: '', error: `Gemini API 请求失败${status}: ${error.message}` }
    }

    return { content: '', error: `Gemini 调用失败: ${(error as Error).message}` }
  }
}
