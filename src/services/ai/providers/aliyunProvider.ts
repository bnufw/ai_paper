/**
 * Aliyun Provider - 阿里云 Qwen 模型调用
 * 通过 OpenAI 兼容端点调用
 */

import { getIdeaApiKey, getIdeaApiEndpoint } from '../../storage/db'
import type { LLMRequest, LLMResponse } from '../../../types/idea'

/** 阿里云 API 请求体类型 */
interface AliyunRequestBody {
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  max_completion_tokens?: number
  extra_body?: {
    enable_thinking?: boolean
  }
}

/**
 * 调用阿里云 Qwen 模型
 */
export async function callAliyun(request: LLMRequest): Promise<LLMResponse> {
  const apiKey = await getIdeaApiKey('aliyun')
  if (!apiKey) {
    return { content: '', error: '未配置阿里云 API Key' }
  }

  const baseUrl = await getIdeaApiEndpoint('aliyun')

  try {
    // 构建请求体
    const body: AliyunRequestBody = {
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userMessage }
      ]
    }

    // 设置 max_tokens
    if (request.maxTokens) {
      body.max_completion_tokens = request.maxTokens
    }

    // 设置 temperature
    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    // Qwen 思考模式：enable_thinking
    if (request.thinkingConfig?.enableThinking) {
      body.extra_body = {
        enable_thinking: true
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
      return { content: '', error: `阿里云 API 错误 (${response.status}): ${errorText}` }
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

    return { content: '', error: `阿里云 Qwen 调用失败: ${(error as Error).message}` }
  }
}
