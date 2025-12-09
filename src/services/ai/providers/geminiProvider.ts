/**
 * Gemini Provider - Google AI 模型调用
 * 复用现有 geminiClient.ts 的逻辑，适配工作流场景
 */

import { GoogleGenAI } from '@google/genai'
import { getAPIKey } from '../../storage/db'
import { withRetry } from '../retryUtils'
import type { LLMRequest, LLMResponse } from '../../../types/idea'

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
    const ai = new GoogleGenAI({ apiKey })

    // 生成配置
    const config: any = {}

    if (request.temperature !== undefined) {
      config.temperature = request.temperature
    }

    if (request.maxTokens !== undefined) {
      config.maxOutputTokens = request.maxTokens
    }

    // 思考模式配置
    if (request.thinkingConfig) {
      // Gemini 3 Pro 使用 thinkingLevel（小写值）
      if (request.model.includes('gemini-3')) {
        const level = request.thinkingConfig.thinkingLevel
        if (level) {
          config.thinkingConfig = {
            thinkingLevel: level.toLowerCase(), // 'LOW' -> 'low', 'HIGH' -> 'high'
            includeThoughts: request.thinkingConfig.includeThoughts ?? false
          }
        }
      }
      // Gemini 2.5 Pro 使用 thinkingBudget
      else if (request.model.includes('2.5')) {
        const budget = request.thinkingConfig.thinkingBudget
        if (budget !== undefined && budget !== 0) {
          config.thinkingConfig = {
            thinkingBudget: budget,
            includeThoughts: request.thinkingConfig.includeThoughts ?? false
          }
        }
      }
    }

    // 检查是否被取消
    if (request.signal?.aborted) {
      return { content: '', error: '请求已取消' }
    }

    // 调用 API（带重试机制）
    const response = await withRetry(
      () => ai.models.generateContent({
        model: request.model,
        contents: request.systemPrompt + '\n\n' + request.userMessage,
        config
      })
    )

    // 检查是否被取消
    if (request.signal?.aborted) {
      return { content: '', error: '请求已取消' }
    }

    // 解析响应
    const candidate = response.candidates?.[0]

    let content = ''
    let thinkingContent = ''

    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        // 检查是否为思考内容
        if (part.thought) {
          thinkingContent += part.text || ''
        } else {
          content += part.text || ''
        }
      }
    }

    if (!content) {
      content = response.text || ''
    }

    return {
      content,
      thinkingContent: thinkingContent || undefined
    }
  } catch (error: any) {
    if (request.signal?.aborted) {
      return { content: '', error: '请求已取消' }
    }

    if (error.status) {
      return { content: '', error: `Gemini API 请求失败 (${error.status}): ${error.message}` }
    }

    return { content: '', error: `Gemini 调用失败: ${error.message}` }
  }
}
