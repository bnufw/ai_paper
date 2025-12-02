/**
 * 统一 LLM 调用服务
 * 根据 provider 分发到不同的提供商实现
 */

import type { LLMRequest, LLMResponse, ModelConfig } from '../../types/idea'
import { callGemini, callOpenAICompatible, callAliyun } from './providers'

/**
 * 统一的 LLM 调用接口
 * 根据 provider 自动分发到对应的实现
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  switch (request.provider) {
    case 'google':
      return callGemini(request)

    case 'openai':
      return callOpenAICompatible(request)

    case 'aliyun':
      return callAliyun(request)

    default:
      return { content: '', error: `不支持的提供商: ${request.provider}` }
  }
}

/**
 * 从模型配置构建 LLM 请求
 */
export function buildLLMRequest(
  config: ModelConfig,
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal
): LLMRequest {
  return {
    provider: config.provider,
    model: config.model,
    systemPrompt,
    userMessage,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    thinkingConfig: config.thinkingConfig,
    signal
  }
}

/**
 * 批量并发调用多个模型
 * @returns Map<模型 slug, LLMResponse>
 */
export async function callMultipleModels(
  configs: ModelConfig[],
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
  onModelStart?: (slug: string) => void,
  onModelComplete?: (slug: string, response: LLMResponse) => void
): Promise<Map<string, LLMResponse>> {
  const results = new Map<string, LLMResponse>()

  // 过滤出启用的模型
  const enabledConfigs = configs.filter(c => c.enabled)

  // 并发调用所有模型
  await Promise.allSettled(
    enabledConfigs.map(async (config) => {
      // 通知开始
      onModelStart?.(config.slug)

      try {
        const request = buildLLMRequest(config, systemPrompt, userMessage, signal)
        const response = await callLLM(request)

        results.set(config.slug, response)
        onModelComplete?.(config.slug, response)
      } catch (error) {
        const errorResponse: LLMResponse = {
          content: '',
          error: `调用失败: ${(error as Error).message}`
        }
        results.set(config.slug, errorResponse)
        onModelComplete?.(config.slug, errorResponse)
      }
    })
  )

  return results
}

/**
 * 检查响应是否有效（非错误）
 */
export function isValidResponse(response: LLMResponse): boolean {
  return !response.error && response.content.trim().length > 0
}

/**
 * 过滤出有效的响应
 */
export function filterValidResponses(responses: Map<string, LLMResponse>): Map<string, LLMResponse> {
  const valid = new Map<string, LLMResponse>()
  for (const [slug, response] of responses) {
    if (isValidResponse(response)) {
      valid.set(slug, response)
    }
  }
  return valid
}
