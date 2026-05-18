import Dexie, { Table } from 'dexie'
import type { IdeaSession, IdeaWorkflowConfig, ModelConfig } from '../../types/idea'
import {
  PRESET_GENERATORS,
  PRESET_EVALUATORS,
  PRESET_SUMMARIZER,
  DEFAULT_ENDPOINTS
} from '../../types/idea'
import { getDirectoryHandle, getDirectory, readTextFile, renameDirectory } from './fileSystem'

// 重新导出 IdeaSession 类型
export type { IdeaSession } from '../../types/idea'

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
  excludeFromIdea?: boolean  // 是否从 Idea 上下文中排除
  sourceId?: string
  sourceProvider?: string
  pdfUrl?: string
  forumUrl?: string
  venue?: string
  year?: number
  authors?: string[]
  createdAt: Date
  updatedAt: Date
}

export interface PaperSourceMetadata {
  sourceId?: string
  sourceProvider?: string
  pdfUrl?: string
  forumUrl?: string
  venue?: string
  year?: number
  authors?: string[]
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
  lastClearAt?: Date  // 上下文清除时间点，发消息时只取此时间之后的历史
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
  addedToNote?: boolean
}

// Idea 对话消息类型
export interface IdeaMessage {
  id?: number
  sessionId: number  // 关联 ideaSessions.id
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  thoughts?: string
  thinkingTimeMs?: number
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
  ideaSessions!: Table<IdeaSession, number>
  ideaMessages!: Table<IdeaMessage, number>  // 新增：Idea 对话消息

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

    // v5: 新增 Idea 工作流会话表
    this.version(5).stores({
      groups: '++id, createdAt',
      papers: '++id, groupId, createdAt',
      images: '++id, paperId, imageIndex',
      conversations: '++id, paperId, createdAt',
      messages: '++id, conversationId, timestamp',
      settings: 'key',
      ideaSessions: '++id, groupId, timestamp, status, createdAt'
    }).upgrade(() => {
      console.log('[DB] 升级数据库到版本 5，新增 ideaSessions 表')
    })

    // v6: 新增 Idea 对话消息表
    this.version(6).stores({
      groups: '++id, createdAt',
      papers: '++id, groupId, createdAt',
      images: '++id, paperId, imageIndex',
      conversations: '++id, paperId, createdAt',
      messages: '++id, conversationId, timestamp',
      settings: 'key',
      ideaSessions: '++id, groupId, timestamp, status, createdAt',
      ideaMessages: '++id, sessionId, timestamp'
    }).upgrade(() => {
      console.log('[DB] 升级数据库到版本 6，新增 ideaMessages 表')
    })

    // v7: 记录论文外部来源，用于搜索导入去重
    this.version(7).stores({
      groups: '++id, createdAt',
      papers: '++id, groupId, createdAt, sourceId, pdfUrl',
      images: '++id, paperId, imageIndex',
      conversations: '++id, paperId, createdAt',
      messages: '++id, conversationId, timestamp',
      settings: 'key',
      ideaSessions: '++id, groupId, timestamp, status, createdAt',
      ideaMessages: '++id, sessionId, timestamp'
    }).upgrade(() => {
      console.log('[DB] 升级数据库到版本 7，新增论文来源索引')
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
  localPath?: string,
  sourceMetadata?: PaperSourceMetadata
): Promise<number> {
  const now = new Date()

  // 保存论文
  const paperId = await db.papers.add({
    title,
    markdown,
    pdfData,
    groupId,
    localPath,
    ...sourceMetadata,
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
 * 按外部来源查找论文，用于搜索导入去重
 */
export async function findPaperBySource(
  sourceId?: string,
  pdfUrl?: string
): Promise<Paper | undefined> {
  if (sourceId) {
    const paper = await db.papers.where('sourceId').equals(sourceId).first()
    if (paper) return paper
  }

  if (pdfUrl) {
    return db.papers.where('pdfUrl').equals(pdfUrl).first()
  }

  return undefined
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

  // 删除缓存元数据（远端缓存由 cacheService.cleanupPaperCache 清理）
  await db.settings.delete(`paper_cache_${paperId}`)
}

/**
 * 删除对话及其消息
 */
export async function deleteConversation(conversationId: number): Promise<void> {
  await db.messages.where('conversationId').equals(conversationId).delete()
  await db.conversations.delete(conversationId)
}

/**
 * 清空对话上下文（设置清除时间点，不删除消息）
 */
export async function clearConversationMessages(conversationId: number): Promise<Date> {
  const now = new Date()
  await db.conversations.update(conversationId, {
    lastClearAt: now,
    updatedAt: now
  })
  return now
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

/**
 * 更新消息内容
 */
export async function updateMessage(messageId: number, content: string, images?: MessageImage[]): Promise<void> {
  await db.messages.update(messageId, {
    content,
    images,
    timestamp: new Date()
  })
}

/**
 * 标记消息已添加到笔记
 */
export async function markMessageAddedToNote(messageId: number): Promise<void> {
  await db.messages.update(messageId, { addedToNote: true })
}

/**
 * 删除指定消息之后的所有消息(包括该消息)
 */
export async function deleteMessagesAfter(conversationId: number, messageId: number): Promise<void> {
  const message = await db.messages.get(messageId)
  if (!message) {
    throw new Error('消息不存在')
  }

  const allMessages = await db.messages
    .where('conversationId')
    .equals(conversationId)
    .sortBy('timestamp')

  const messageIndex = allMessages.findIndex(m => m.id === messageId)
  if (messageIndex === -1) return

  const messagesToDelete = allMessages.slice(messageIndex)
  await db.messages.bulkDelete(messagesToDelete.map(m => m.id!))
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
  const paper = await db.papers.get(paperId)
  if (!paper) {
    throw new Error('论文不存在')
  }

  let localPath = paper.localPath
  const targetGroupName = await getTargetGroupName(groupId)

  if (localPath) {
    const folderName = getPaperFolderName(localPath)
    const targetLocalPath = `${targetGroupName}/${folderName}`

    if (targetLocalPath !== localPath) {
      const rootHandle = await getDirectoryHandle()
      if (!rootHandle) {
        throw new Error('未配置存储目录')
      }

      await renameDirectory(rootHandle, localPath, targetLocalPath)
      localPath = targetLocalPath
    }
  }

  await db.papers.update(paperId, {
    groupId,
    localPath,
    updatedAt: new Date()
  })
}

async function getTargetGroupName(groupId?: number): Promise<string> {
  if (groupId === undefined) {
    return '未分类'
  }

  const group = await db.groups.get(groupId)
  if (!group) {
    throw new Error('目标分组不存在')
  }

  return group.name
}

function getPaperFolderName(localPath: string): string {
  const parts = localPath.split('/').filter(Boolean)
  const folderName = parts[parts.length - 1]
  if (!folderName) {
    throw new Error('论文本地路径无效')
  }

  return folderName
}

/**
 * 更新论文标题
 */
export async function updatePaperTitle(paperId: number, title: string): Promise<void> {
  await db.papers.update(paperId, {
    title,
    updatedAt: new Date()
  })
}

/**
 * 切换论文是否从 Idea 上下文中排除
 */
export async function togglePaperExcludeFromIdea(paperId: number): Promise<boolean> {
  const paper = await db.papers.get(paperId)
  if (!paper) return false

  const newValue = !paper.excludeFromIdea
  await db.papers.update(paperId, { excludeFromIdea: newValue })
  return newValue
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
    const rootHandle = await getDirectoryHandle()
    if (rootHandle) {
      try {
        const paperDirHandle = await getDirectory(rootHandle, paper.localPath)
        let content = await readTextFile(paperDirHandle, 'paper.md')

        // 大文件截断(超过50KB取前50KB)
        const MAX_SIZE = 50 * 1024
        if (content.length > MAX_SIZE) {
          content = content.substring(0, MAX_SIZE) + '\n\n[... 内容过长,已截断 ...]'
        }

        return content
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

// ========== Idea 工作流相关函数 ==========

/**
 * 合并预设模型：将代码中的新预设模型添加到用户配置中
 */
function mergePresetModels(
  userModels: ModelConfig[],
  presetModels: ModelConfig[]
): ModelConfig[] {
  const presetMap = new Map(presetModels.map(p => [p.id, p]))
  const userIds = new Set(userModels.map(m => m.id))

  // 更新已存在的预设模型（同步 model、slug 等字段，保留用户配置）
  const updatedModels = userModels.map(m => {
    const preset = presetMap.get(m.id)
    if (preset && m.isPreset) {
      return {
        ...m,
        model: preset.model,
        slug: preset.slug,
        provider: preset.provider
      }
    }
    return m
  })

  // 添加新的预设模型
  const newPresets = presetModels.filter(p => !userIds.has(p.id))
  if (newPresets.length === 0) {
    return updatedModels
  }

  // 新预设默认禁用，追加到列表末尾
  return [...updatedModels, ...newPresets.map(p => ({ ...p, enabled: false }))]
}

/**
 * 获取 Idea 工作流配置
 * 自动合并代码中新增的预设模型
 */
export async function getIdeaWorkflowConfig(): Promise<IdeaWorkflowConfig> {
  const setting = await db.settings.get('idea_workflow_config')
  if (setting?.value) {
    const config = JSON.parse(setting.value) as Partial<IdeaWorkflowConfig>

    // 检查并合并新的预设模型
    const mergedGenerators = mergePresetModels(config.generators || [], PRESET_GENERATORS)
    const mergedEvaluators = mergePresetModels(config.evaluators || [], PRESET_EVALUATORS)

    // 补全可能缺失的新字段（向后兼容旧配置）
    const normalizedConfig: IdeaWorkflowConfig = {
      generators: mergedGenerators,
      evaluators: mergedEvaluators,
      summarizer: config.summarizer || PRESET_SUMMARIZER,
      prompts: config.prompts || { generator: '', evaluator: '', summarizer: '' },
      userIdea: config.userIdea ?? ''
    }

    // 检查预设模型是否有字段更新
    const hasPresetUpdates = (userModels: ModelConfig[], presetModels: ModelConfig[]) => {
      const presetMap = new Map(presetModels.map(p => [p.id, p]))
      return userModels.some(m => {
        const preset = presetMap.get(m.id)
        return preset && m.isPreset && (m.model !== preset.model || m.slug !== preset.slug)
      })
    }

    // 如果配置有变更（新模型、字段更新或新字段），自动保存
    const needsUpdate =
      mergedGenerators.length !== (config.generators?.length || 0) ||
      mergedEvaluators.length !== (config.evaluators?.length || 0) ||
      hasPresetUpdates(config.generators || [], PRESET_GENERATORS) ||
      hasPresetUpdates(config.evaluators || [], PRESET_EVALUATORS) ||
      config.userIdea === undefined

    if (needsUpdate) {
      await saveIdeaWorkflowConfig(normalizedConfig)
    }

    return normalizedConfig
  }

  // 返回默认配置
  return {
    generators: PRESET_GENERATORS,
    evaluators: PRESET_EVALUATORS,
    summarizer: PRESET_SUMMARIZER,
    prompts: {
      generator: '',  // 空字符串表示使用默认提示词
      evaluator: '',
      summarizer: ''
    },
    userIdea: ''
  }
}

/**
 * 保存 Idea 工作流配置
 */
export async function saveIdeaWorkflowConfig(config: IdeaWorkflowConfig): Promise<void> {
  await db.settings.put({
    key: 'idea_workflow_config',
    value: JSON.stringify(config)
  })
}

/**
 * 获取 Idea 工作流 API 密钥
 */
export async function getIdeaApiKey(provider: 'openai' | 'aliyun'): Promise<string | null> {
  const keyMap = {
    openai: 'idea_openai_api_key',
    aliyun: 'idea_aliyun_api_key'
  }
  const setting = await db.settings.get(keyMap[provider])
  return setting?.value || null
}

/**
 * 保存 Idea 工作流 API 密钥
 */
export async function saveIdeaApiKey(provider: 'openai' | 'aliyun', value: string): Promise<void> {
  const keyMap = {
    openai: 'idea_openai_api_key',
    aliyun: 'idea_aliyun_api_key'
  }
  await db.settings.put({ key: keyMap[provider], value })
}

/**
 * 获取 Idea 工作流 API 端点
 */
export async function getIdeaApiEndpoint(provider: 'openai' | 'aliyun'): Promise<string> {
  const keyMap = {
    openai: 'idea_openai_base_url',
    aliyun: 'idea_aliyun_base_url'
  }
  const setting = await db.settings.get(keyMap[provider])
  return setting?.value || DEFAULT_ENDPOINTS[provider] || ''
}

/**
 * 保存 Idea 工作流 API 端点
 */
export async function saveIdeaApiEndpoint(provider: 'openai' | 'aliyun', value: string): Promise<void> {
  const keyMap = {
    openai: 'idea_openai_base_url',
    aliyun: 'idea_aliyun_base_url'
  }
  await db.settings.put({ key: keyMap[provider], value })
}

/**
 * 创建 Idea 会话
 */
export async function createIdeaSession(
  groupId: number,
  groupName: string,
  timestamp: string,
  localPath: string
): Promise<number> {
  return await db.ideaSessions.add({
    groupId,
    groupName,
    timestamp,
    status: 'running',
    localPath,
    createdAt: new Date()
  })
}

/**
 * 更新 Idea 会话状态
 */
export async function updateIdeaSessionStatus(
  sessionId: number,
  status: IdeaSession['status'],
  extras?: { bestIdeaSlug?: string; error?: string }
): Promise<void> {
  const updates: Partial<IdeaSession> = { status }

  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    updates.completedAt = new Date()
  }

  if (extras?.bestIdeaSlug) {
    updates.bestIdeaSlug = extras.bestIdeaSlug
  }

  if (extras?.error) {
    updates.error = extras.error
  }

  await db.ideaSessions.update(sessionId, updates)
}

/**
 * 获取分组的 Idea 会话历史
 */
export async function getIdeaSessionsByGroup(groupId: number): Promise<IdeaSession[]> {
  return db.ideaSessions
    .where('groupId')
    .equals(groupId)
    .reverse()
    .sortBy('createdAt')
}

/**
 * 获取单个 Idea 会话
 */
export async function getIdeaSession(sessionId: number): Promise<IdeaSession | undefined> {
  return db.ideaSessions.get(sessionId)
}

/**
 * 删除 Idea 会话及其消息
 */
export async function deleteIdeaSession(sessionId: number): Promise<void> {
  await deleteIdeaMessages(sessionId)
  await db.ideaSessions.delete(sessionId)
}

/**
 * 获取所有 Idea 会话（按时间倒序）
 */
export async function getAllIdeaSessions(): Promise<IdeaSession[]> {
  return db.ideaSessions.orderBy('createdAt').reverse().toArray()
}

// ========== Idea 对话消息函数 ==========

/**
 * 获取 Idea 会话的所有消息
 */
export async function getIdeaMessages(sessionId: number): Promise<IdeaMessage[]> {
  return db.ideaMessages
    .where('sessionId')
    .equals(sessionId)
    .sortBy('timestamp')
}

/**
 * 保存 Idea 对话消息
 */
export async function saveIdeaMessage(message: Omit<IdeaMessage, 'id'>): Promise<number> {
  return await db.ideaMessages.add(message as IdeaMessage)
}

/**
 * 删除 Idea 会话的所有消息
 */
export async function deleteIdeaMessages(sessionId: number): Promise<void> {
  await db.ideaMessages.where('sessionId').equals(sessionId).delete()
}

/**
 * 导出 Idea 对话为 Markdown
 */
export async function exportIdeaChat(sessionId: number): Promise<string> {
  const session = await db.ideaSessions.get(sessionId)
  if (!session) {
    throw new Error('会话不存在')
  }

  const messages = await getIdeaMessages(sessionId)

  const lines: string[] = []

  lines.push(`# Idea 对话记录`)
  lines.push('')
  lines.push(`**分组**: ${session.groupName}`)
  lines.push(`**创建时间**: ${session.createdAt.toLocaleString('zh-CN')}`)
  if (session.completedAt) {
    lines.push(`**完成时间**: ${session.completedAt.toLocaleString('zh-CN')}`)
  }
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
