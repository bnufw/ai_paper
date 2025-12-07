import { GoogleGenAI } from '@google/genai'
import { getAPIKey, db } from '../storage/db'

// 缓存元数据类型
export interface CacheMetadata {
  paperId: number
  cacheName: string        // Gemini 返回的缓存ID (如 caches/xxx)
  model: string            // 绑定的模型
  expireTime: string       // ISO 时间字符串
  createdAt: string        // ISO 时间字符串（JSON 序列化兼容）
}

// 缓存 TTL（1小时，单位秒）
const CACHE_TTL_SECONDS = 600

/**
 * 获取论文的缓存元数据
 */
export async function getCacheMetadata(paperId: number): Promise<CacheMetadata | null> {
  const setting = await db.settings.get(`paper_cache_${paperId}`)
  if (!setting?.value) return null
  return JSON.parse(setting.value) as CacheMetadata
}

/**
 * 保存缓存元数据
 */
async function saveCacheMetadata(metadata: CacheMetadata): Promise<void> {
  await db.settings.put({
    key: `paper_cache_${metadata.paperId}`,
    value: JSON.stringify(metadata)
  })
}

/**
 * 删除缓存元数据
 */
export async function deleteCacheMetadata(paperId: number): Promise<void> {
  await db.settings.delete(`paper_cache_${paperId}`)
}

/**
 * 检查缓存是否有效
 */
export function isCacheValid(metadata: CacheMetadata | null, currentModel: string): boolean {
  if (!metadata) return false

  // 模型不匹配
  if (metadata.model !== currentModel) return false

  // 检查过期时间（提前5分钟视为过期）
  const expireTime = new Date(metadata.expireTime)
  const now = new Date()
  const bufferMs = 5 * 60 * 1000

  return expireTime.getTime() - bufferMs > now.getTime()
}

/**
 * 创建论文内容缓存
 */
export async function createPaperCache(
  paperId: number,
  paperContent: string,
  model: string
): Promise<string> {
  const apiKey = await getAPIKey('gemini')
  if (!apiKey) {
    throw new Error('未配置 Gemini API Key')
  }

  const ai = new GoogleGenAI({ apiKey })

  // 构建缓存内容：论文 + 系统指令
  const systemInstruction = '你是一个学术论文分析助手。请基于缓存的论文内容回答用户问题。'

  const cache = await ai.caches.create({
    model,
    config: {
      contents: [
        {
          role: 'user',
          parts: [{ text: `这是一篇学术论文的内容:\n\n${paperContent}` }]
        },
        {
          role: 'model',
          parts: [{ text: '好的，我已经阅读了这篇论文，请问有什么问题？' }]
        }
      ],
      systemInstruction,
      ttl: `${CACHE_TTL_SECONDS}s`
    }
  })

  if (!cache.name) {
    throw new Error('创建缓存失败：未返回缓存名称')
  }

  // 保存元数据
  const metadata: CacheMetadata = {
    paperId,
    cacheName: cache.name,
    model,
    expireTime: cache.expireTime || new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString(),
    createdAt: new Date().toISOString()
  }

  await saveCacheMetadata(metadata)
  console.log(`[Cache] 创建缓存成功: ${cache.name}，过期时间: ${metadata.expireTime}`)

  return cache.name
}

/**
 * 获取或创建论文缓存
 * 返回有效的缓存名称，如果无法创建则返回 null
 */
export async function getOrCreatePaperCache(
  paperId: number,
  paperContent: string,
  model: string
): Promise<string | null> {
  try {
    // 检查现有缓存
    const existing = await getCacheMetadata(paperId)

    if (isCacheValid(existing, model)) {
      // 乐观使用缓存，不额外验证（避免增加延迟）
      // 如果远端缓存已失效，geminiClient 会捕获错误并调用 invalidateCache 触发重建
      console.log(`[Cache] 使用现有缓存: ${existing!.cacheName}`)
      return existing!.cacheName
    }

    // 缓存无效，创建新缓存
    if (existing) {
      console.log(`[Cache] 缓存无效（过期或模型不匹配），重新创建`)
      // 尝试删除旧缓存（忽略错误）
      try {
        const apiKey = await getAPIKey('gemini')
        if (apiKey) {
          const ai = new GoogleGenAI({ apiKey })
          await ai.caches.delete({ name: existing.cacheName })
        }
      } catch {
        // 忽略删除错误
      }
    }

    return await createPaperCache(paperId, paperContent, model)
  } catch (err) {
    console.error('[Cache] 缓存操作失败，将使用传统模式:', err)
    // 清理可能损坏的元数据
    await deleteCacheMetadata(paperId)
    return null
  }
}

/**
 * 使缓存失效（当远端缓存不存在时调用）
 * 由 geminiClient 在捕获到缓存相关错误时调用
 */
export async function invalidateCache(paperId: number): Promise<void> {
  console.log(`[Cache] 使缓存失效: paperId=${paperId}`)
  await deleteCacheMetadata(paperId)
}

/**
 * 刷新缓存 TTL
 */
export async function refreshCacheTTL(paperId: number): Promise<void> {
  const metadata = await getCacheMetadata(paperId)
  if (!metadata) return

  try {
    const apiKey = await getAPIKey('gemini')
    if (!apiKey) return

    const ai = new GoogleGenAI({ apiKey })
    const updated = await ai.caches.update({
      name: metadata.cacheName,
      config: { ttl: `${CACHE_TTL_SECONDS}s` }
    })

    // 更新本地元数据
    if (updated.expireTime) {
      metadata.expireTime = updated.expireTime
      await saveCacheMetadata(metadata)
      console.log(`[Cache] TTL 已刷新: ${metadata.cacheName}`)
    }
  } catch (err) {
    console.warn('[Cache] 刷新 TTL 失败:', err)
  }
}

/**
 * 清理论文缓存（论文删除时调用）
 */
export async function cleanupPaperCache(paperId: number): Promise<void> {
  const metadata = await getCacheMetadata(paperId)
  if (!metadata) return

  try {
    const apiKey = await getAPIKey('gemini')
    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey })
      await ai.caches.delete({ name: metadata.cacheName })
      console.log(`[Cache] 已删除缓存: ${metadata.cacheName}`)
    }
  } catch {
    // 忽略删除错误
  }

  await deleteCacheMetadata(paperId)
}
