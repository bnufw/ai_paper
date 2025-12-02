/**
 * OpenAI Compatible Provider - 支持 Claude、GPT-5、o4-mini
 * 通过 OpenAI 兼容端点调用各种模型
 */

import { getIdeaApiKey, getIdeaApiEndpoint } from '../../storage/db'
import type { LLMRequest, LLMResponse } from '../../../types/idea'

/** OpenAI 兼容 API 请求体类型 */
interface OpenAIRequestBody {
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  max_tokens?: number
  max_completion_tokens?: number
  extra_body?: {
    thinking?: { type: 'enabled' | 'disabled'; budget_tokens?: number }
    reasoning?: { effort: string }
    text?: { verbosity: string }
  }
}

/**
 * 调用 OpenAI 兼容端点
 * 支持：Claude 4.5 Sonnet、GPT-5、GPT-5.1、o4-mini、o3
 */
export async function callOpenAICompatible(request: LLMRequest): Promise<LLMResponse> {
  const apiKey = await getIdeaApiKey('openai')
  if (!apiKey) {
    return { content: '', error: '未配置 OpenAI 兼容端点 API Key' }
  }

  const baseUrl = await getIdeaApiEndpoint('openai')

  try {
    // 构建请求体
    const body: OpenAIRequestBody = {
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userMessage }
      ]
    }

    // 检测模型类型
    const modelLower = request.model.toLowerCase()
    const isClaude = modelLower.includes('claude')
    const isGpt5 = modelLower.includes('gpt-5')
    const isO3O4 = modelLower.includes('o3') || modelLower.includes('o4')

    // 设置 max_tokens / max_completion_tokens
    if (request.maxTokens) {
      if (isGpt5 || isO3O4) {
        body.max_completion_tokens = request.maxTokens
      } else {
        body.max_tokens = request.maxTokens
      }
    }

    // 设置 temperature（仅非推理模型可用）
    if (request.temperature !== undefined && !isO3O4) {
      body.temperature = request.temperature
    }

    // 处理思考模式参数
    if (request.thinkingConfig) {
      const config = request.thinkingConfig

      // Claude: thinking.type + budget_tokens
      if (isClaude && config.thinkingType === 'enabled') {
        body.extra_body = {
          thinking: {
            type: 'enabled',
            budget_tokens: config.budgetTokens || 3500
          }
        }
        // Claude 启用 thinking 时 temperature 必须为 1
        body.temperature = 1
      }

      // GPT-5: reasoning_effort + verbosity
      if (isGpt5) {
        body.extra_body = body.extra_body || {}

        if (config.reasoningEffort) {
          body.extra_body.reasoning = {
            effort: config.reasoningEffort
          }
        }

        if (config.verbosity) {
          body.extra_body.text = {
            verbosity: config.verbosity
          }
        }
      }

      // o3/o4: reasoning_effort
      if (isO3O4 && config.reasoningEffort) {
        body.extra_body = body.extra_body || {}
        body.extra_body.reasoning = {
          effort: config.reasoningEffort
        }
      }
    }

    // 发起请求
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: request.signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { content: '', error: `OpenAI API 错误 (${response.status}): ${errorText}` }
    }

    const data = await response.json()

    // 解析响应
    const choice = data.choices?.[0]
    if (!choice) {
      return { content: '', error: 'API 返回空响应' }
    }

    const content = choice.message?.content || ''

    // 提取 usage
    const usage = data.usage ? {
      inputTokens: data.usage.prompt_tokens || 0,
      outputTokens: data.usage.completion_tokens || 0
    } : undefined

    return { content, usage }
  } catch (error) {
    if (request.signal?.aborted) {
      return { content: '', error: '请求已取消' }
    }

    return { content: '', error: `OpenAI 兼容端点调用失败: ${(error as Error).message}` }
  }
}
