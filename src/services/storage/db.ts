import Dexie, { Table } from 'dexie'

// 论文分组类型
export interface PaperGroup {
  id?: number
  name: string
  createdAt: Date
}

// 论文类型
export interface Paper {
  id?: number
  title: string
  markdown: string        // 纯文本 Markdown（不含图片 base64）
  groupId?: number        // 所属分组 ID
  localPath?: string      // 本地文件夹路径（相对于根目录）
  pdfData?: string        // base64编码的PDF文件（废弃，迁移后删除）
  createdAt: Date
  updatedAt: Date
}

// 论文图片类型（废弃，迁移后删除）
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

// 消息图片类型
export interface MessageImage {
  data: string       // base64编码的图片数据
  mimeType: string   // 'image/jpeg' | 'image/png' | 'image/webp'
  width?: number
  height?: number
}

// 消息类型
export interface Message {
  id?: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  images?: MessageImage[]
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
  groups!: Table<PaperGroup, number>
  papers!: Table<Paper, number>
  images!: Table<PaperImage, number>
  conversations!: Table<Conversation, number>
  messages!: Table<Message, number>
  settings!: Table<Settings, string>

  constructor() {
    super('PaperReaderDB')

    // v2: 添加 pdfData 字段
    this.version(2).stores({
      papers: '++id, createdAt',
      images: '++id, paperId, imageIndex',
      conversations: '++id, paperId, createdAt',
      messages: '++id, conversationId, timestamp',
      settings: 'key'
    })

    // v3: 添加分组功能和本地存储路径
    this.version(3).stores({
      groups: '++id, createdAt',
      papers: '++id, groupId, createdAt',
      images: '++id, paperId, imageIndex',
      conversations: '++id, paperId, createdAt',
      messages: '++id, conversationId, timestamp',
      settings: 'key'
    })

    // v4: 消息支持图片(无需迁移,新字段为可选)
    this.version(4).stores({
      groups: '++id, createdAt',
      papers: '++id, groupId, createdAt',
      images: '++id, paperId, imageIndex',
      conversations: '++id, paperId, createdAt',
      messages: '++id, conversationId, timestamp',
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
 * 创建新论文（新版本 - 支持分组和本地存储）
 */
export async function createPaper(
  title: string,
  markdown: string,
  images: string[],
  pdfData?: string,
  groupId?: number,
  localPath?: string
): Promise<number> {
  const now = new Date()

  // 保存论文
  const paperId = await db.papers.add({
    title,
    markdown,
    pdfData,
    groupId,
    localPath,
    createdAt: now,
    updatedAt: now
  })

  // 仅在没有本地路径时保存图片到 DB（兼容旧数据）
  if (!localPath && images.length > 0) {
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

// ========== 分组管理函数 ==========

/**
 * 创建分组
 */
export async function createGroup(name: string): Promise<number> {
  return await db.groups.add({
    name: name.trim(),
    createdAt: new Date()
  })
}

/**
 * 重命名分组
 */
export async function renameGroup(id: number, newName: string): Promise<void> {
  await db.groups.update(id, { name: newName.trim() })
}

/**
 * 删除分组（论文移至未分类）
 */
export async function deleteGroup(id: number): Promise<void> {
  await db.papers.where('groupId').equals(id).modify({ groupId: undefined })
  await db.groups.delete(id)
}

/**
 * 获取所有分组
 */
export async function getAllGroups(): Promise<PaperGroup[]> {
  return db.groups.orderBy('createdAt').toArray()
}

/**
 * 移动论文到分组
 */
export async function movePaperToGroup(paperId: number, groupId?: number): Promise<void> {
  await db.papers.update(paperId, { 
    groupId,
    updatedAt: new Date()
  })
}

/**
 * 按分组获取论文
 */
export async function getPapersByGroup(groupId?: number): Promise<Paper[]> {
  if (groupId === undefined) {
    return db.papers.filter(p => !p.groupId).reverse().sortBy('createdAt')
  }
  return db.papers.where('groupId').equals(groupId).reverse().sortBy('createdAt')
}

/**
 * 获取存储目录路径
 */
export async function getStorageRootPath(): Promise<string | null> {
  const setting = await db.settings.get('storage_root_path')
  return setting?.value || null
}

/**
 * 保存存储目录路径
 */
export async function saveStorageRootPath(path: string): Promise<void> {
  await db.settings.put({ key: 'storage_root_path', value: path })
}

/**
 * 获取论文的paper.md内容
 * 优先从本地文件读取,回退到数据库markdown字段
 */
export async function getPaperMarkdown(paperId: number): Promise<string> {
  const paper = await db.papers.get(paperId)
  if (!paper) {
    throw new Error('论文不存在')
  }

  // 优先从本地文件读取
  if (paper.localPath) {
    const rootPath = await getStorageRootPath()
    if (rootPath) {
      try {
        const paperMdPath = `${rootPath}/${paper.localPath}/paper.md`
        // 使用File System Access API读取文件
        const response = await fetch(paperMdPath)
        if (response.ok) {
          let content = await response.text()
          
          // 大文件截断(超过50KB取前50KB)
          const MAX_SIZE = 50 * 1024
          if (content.length > MAX_SIZE) {
            content = content.substring(0, MAX_SIZE) + '\n\n[... 内容过长,已截断 ...]'
          }
          
          return content
        }
      } catch (err) {
        console.warn('无法从本地读取paper.md,回退到数据库:', err)
      }
    }
  }

  // 回退到数据库
  let markdown = paper.markdown
  const MAX_SIZE = 50 * 1024
  if (markdown.length > MAX_SIZE) {
    markdown = markdown.substring(0, MAX_SIZE) + '\n\n[... 内容过长,已截断 ...]'
  }
  
  return markdown
}
