import Dexie, { Table } from 'dexie'

// 论文类型
export interface Paper {
  id?: number
  title: string
  markdown: string
  pdfData?: string  // base64编码的PDF文件
  createdAt: Date
  updatedAt: Date
}

// 论文图片类型
export interface PaperImage {
  id?: number
  paperId: number
  imageData: string
  imageIndex: number
}

// 对话会话类型
export interface Conversation {
  id?: number
  paperId: number
  title: string
  createdAt: Date
  updatedAt: Date
}

// 消息类型
export interface Message {
  id?: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  thoughts?: string
  thinkingTimeMs?: number
  generationStartTime?: Date
  generationEndTime?: Date
  groundingMetadata?: any
  webSearchQueries?: string[]
}

// 设置类型
export interface Settings {
  key: string
  value: string
}

// Gemini配置类型
export interface GeminiSettings {
  model: 'gemini-2.5-pro' | 'gemini-3-pro-preview'
  temperature: number
  streaming: boolean
  useSearch: boolean
  showThoughts: boolean
  thinkingBudget: number
  thinkingLevel?: 'LOW' | 'HIGH'
}

/**
 * 学术论文阅读器的IndexedDB数据库
 * 使用Dexie.js封装，提供类型安全的数据访问
 */
class PaperReaderDatabase extends Dexie {
  // 声明表结构
  papers!: Table<Paper, number>
  images!: Table<PaperImage, number>
  conversations!: Table<Conversation, number>
  messages!: Table<Message, number>
  settings!: Table<Settings, string>

  constructor() {
    super('PaperReaderDB')

    // 定义数据库schema
    // v2: 添加 pdfData 字段
    this.version(2).stores({
      // papers表：按创建时间索引
      papers: '++id, createdAt',

      // images表：按论文ID和图片序号索引
      images: '++id, paperId, imageIndex',

      // conversations表：按论文ID和创建时间索引
      conversations: '++id, paperId, createdAt',

      // messages表：按对话ID和时间戳索引
      messages: '++id, conversationId, timestamp',

      // settings表：key作为主键
      settings: 'key'
    })
  }
}

// 导出数据库单例
export const db = new PaperReaderDatabase()

// 导出辅助函数

/**
 * 获取API密钥
 */
export async function getAPIKey(provider: 'mistral' | 'gemini'): Promise<string | null> {
  const keyMap = {
    mistral: 'mistral_api_key',
    gemini: 'gemini_api_key'
  }

  const setting = await db.settings.get(keyMap[provider])
  return setting?.value || null
}

/**
 * 保存API密钥
 */
export async function saveAPIKey(provider: 'mistral' | 'gemini', value: string): Promise<void> {
  const keyMap = {
    mistral: 'mistral_api_key',
    gemini: 'gemini_api_key'
  }

  await db.settings.put({ key: keyMap[provider], value })
}

/**
 * 获取Gemini配置
 */
export async function getGeminiSettings(): Promise<GeminiSettings> {
  const setting = await db.settings.get('gemini_settings')
  if (setting?.value) {
    return JSON.parse(setting.value)
  }
  
  // 默认配置
  return {
    model: 'gemini-2.5-pro',
    temperature: 1.0,
    streaming: true,
    useSearch: false,
    showThoughts: true,
    thinkingBudget: 8192,
    thinkingLevel: 'HIGH'
  }
}

/**
 * 保存Gemini配置
 */
export async function saveGeminiSettings(settings: GeminiSettings): Promise<void> {
  await db.settings.put({ 
    key: 'gemini_settings', 
    value: JSON.stringify(settings) 
  })
}

/**
 * 获取所有论文（按创建时间倒序）
 */
export async function getAllPapers(): Promise<Paper[]> {
  return db.papers.orderBy('createdAt').reverse().toArray()
}

/**
 * 获取论文的所有图片
 */
export async function getPaperImages(paperId: number): Promise<PaperImage[]> {
  return db.images.where('paperId').equals(paperId).sortBy('imageIndex')
}

/**
 * 创建新论文
 */
export async function createPaper(
  title: string,
  markdown: string,
  images: string[],
  pdfData?: string
): Promise<number> {
  const now = new Date()

  // 保存论文
  const paperId = await db.papers.add({
    title,
    markdown,
    pdfData,
    createdAt: now,
    updatedAt: now
  })

  // 保存图片
  if (images.length > 0) {
    const imageRecords = images.map((imageData, index) => ({
      paperId,
      imageData,
      imageIndex: index
    }))
    await db.images.bulkAdd(imageRecords)
  }

  return paperId
}

/**
 * 删除论文及其相关数据
 */
export async function deletePaper(paperId: number): Promise<void> {
  // 删除论文
  await db.papers.delete(paperId)

  // 删除相关图片
  await db.images.where('paperId').equals(paperId).delete()

  // 删除相关对话
  const conversations = await db.conversations.where('paperId').equals(paperId).toArray()
  const conversationIds = conversations.map(c => c.id!)

  for (const convId of conversationIds) {
    await db.messages.where('conversationId').equals(convId).delete()
  }

  await db.conversations.where('paperId').equals(paperId).delete()
}

/**
 * 删除对话及其消息
 */
export async function deleteConversation(conversationId: number): Promise<void> {
  await db.messages.where('conversationId').equals(conversationId).delete()
  await db.conversations.delete(conversationId)
}

/**
 * 重命名对话
 */
export async function renameConversation(conversationId: number, newTitle: string): Promise<void> {
  await db.conversations.update(conversationId, {
    title: newTitle.trim(),
    updatedAt: new Date()
  })
}

/**
 * 导出对话为Markdown
 */
export async function exportConversation(conversationId: number): Promise<string> {
  const conversation = await db.conversations.get(conversationId)
  if (!conversation) {
    throw new Error('对话不存在')
  }

  const messages = await db.messages
    .where('conversationId')
    .equals(conversationId)
    .sortBy('timestamp')

  const lines: string[] = []
  
  lines.push(`# ${conversation.title}`)
  lines.push('')
  lines.push(`**创建时间**: ${conversation.createdAt.toLocaleString('zh-CN')}`)
  lines.push(`**更新时间**: ${conversation.updatedAt.toLocaleString('zh-CN')}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const msg of messages) {
    const role = msg.role === 'user' ? '👤 用户' : '🤖 助手'
    const time = new Date(msg.timestamp).toLocaleString('zh-CN')
    
    lines.push(`## ${role} (${time})`)
    lines.push('')
    lines.push(msg.content)
    lines.push('')
  }

  return lines.join('\n')
}
