/**
 * API 请求重试工具
 * 支持指数退避和可配置的重试策略
 */

// 默认重试配置
const DEFAULT_MAX_RETRIES = 8
const DEFAULT_INITIAL_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 30000

// 可重试的 HTTP 状态码
const RETRIABLE_STATUS_CODES = [429, 500, 502, 503, 504]

export interface RetryConfig {
  maxRetries?: number
  initialDelayMs?: number
  maxDelayMs?: number
  onRetry?: (attempt: number, delayMs: number, error: any) => void
}

/**
 * 判断错误是否为可重试的临时性错误
 */
export function isRetriableError(error: any): boolean {
  // 优先检查 status code
  if (error.status && RETRIABLE_STATUS_CODES.includes(error.status)) {
    return true
  }
  // 检查错误信息
  const msg = (error.message || '').toLowerCase()
  return msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('429') ||
    msg.includes('service unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('unavailable')
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 带指数退避的重试包装器
 * @param fn 要执行的异步函数
 * @param config 重试配置
 * @returns 函数执行结果
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: RetryConfig
): Promise<T> {
  const maxRetries = config?.maxRetries ?? DEFAULT_MAX_RETRIES
  const initialDelayMs = config?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS
  const maxDelayMs = config?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS

  let lastError: any
  for (let attempt = 0; attempt < maxRetries + 1; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      // 非可重试错误或已达最大重试次数，直接抛出
      if (!isRetriableError(error) || attempt >= maxRetries) {
        throw error
      }
      // 指数退避 + 轻微随机抖动
      const baseDelay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs)
      const jitter = baseDelay * 0.1 * Math.random() // 10% 随机抖动
      const delayMs = Math.round(baseDelay + jitter)

      console.log(`[Retry] 请求失败 (${error.status || error.message})，第 ${attempt + 1}/${maxRetries} 次重试，等待 ${delayMs}ms`)
      config?.onRetry?.(attempt + 1, delayMs, error)
      await delay(delayMs)
    }
  }
  throw lastError
}
