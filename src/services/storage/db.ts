import Dexie, { Table } from 'dexie'
import type { IdeaSession, IdeaWorkflowConfig, ModelConfig } from '../../types/idea'
import {
  PRESET_GENERATORS,
  PRESET_EVALUATORS,
  PRESET_SUMMARIZER,
  DEFAULT_ENDPOINTS
} from '../../types/idea'
import { getDirectoryHandle, getDirectory, readTextFile } from './fileSystem'

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
  lastClearAt?: Date  // 上下文清除时间点，发消息时只取此时间之后的历史
  // 分支功能
  activeBranchId?: number  // 当前活跃分支 ID（0 = 主分支）
  branchCount?: number     // 分支总数（用于生成新分支 ID）
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
  // 分支功能
  branchId?: number         // 所属分支 ID（0 = 主分支，undefined 视为 0）
  parentMessageId?: number  // 分支起点消息 ID（仅分支的第一条消息有值）
}

// 消息版本历史类型（用于重新生成功能）
export interface MessageVersion {
  id?: number
  messageId: number       // 原消息 ID
  content: string         // 保存的内容
  thoughts?: string       // 保存的思考过程
  thinkingTimeMs?: number
  timestamp: Date         // 生成时间
}

// Idea 对话会话类型
export interface IdeaConversation {
  id?: number
  sessionId: number     // 关联 ideaSessions.id
  title: string
  createdAt: Date
  updatedAt: Date
}

// Idea 对话消息类型
export interface IdeaMessage {
  id?: number
  conversationId: number  // 关联 ideaConversations.id
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
  messageVersions!: Table<MessageVersion, number>  // 消息版本历史
  settings!: Table<Settings, string>
  ideaSessions!: Table<IdeaSession, number>
  ideaConversations!: Table<IdeaConversation, number>  // Idea 对话会话
  ideaMessages!: Table<IdeaMessage, number>  // Idea 对话消息

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

    // v7: 新增消息版本历史表（用于重新生成功能）
    this.version(7).stores({
      groups: '++id, createdAt',
      papers: '++id, groupId, createdAt',
      images: '++id, paperId, imageIndex',
      conversations: '++id, paperId, createdAt',
      messages: '++id, conversationId, timestamp',
      messageVersions: '++id, messageId, timestamp',
      settings: 'key',
      ideaSessions: '++id, groupId, timestamp, status, createdAt',
      ideaMessages: '++id, sessionId, timestamp'
    }).upgrade(() => {
      console.log('[DB] 升级数据库到版本 7，新增 messageVersions 表')
    })

    // v8: 添加消息分支索引
    this.version(8).stores({
      groups: '++id, createdAt',
      papers: '++id, groupId, createdAt',
      images: '++id, paperId, imageIndex',
      conversations: '++id, paperId, createdAt',
      messages: '++id, conversationId, timestamp, branchId',
      messageVersions: '++id, messageId, timestamp',
      settings: 'key',
      ideaSessions: '++id, groupId, timestamp, status, createdAt',
      ideaMessages: '++id, sessionId, timestamp'
    }).upgrade(() => {
      console.log('[DB] 升级数据库到版本 8，添加消息分支索引')
    })

    // v9: 新增 ideaConversations 表，修改 ideaMessages 索引为 conversationId
    this.version(9).stores({
      groups: '++id, createdAt',
      papers: '++id, groupId, createdAt',
      images: '++id, paperId, imageIndex',
      conversations: '++id, paperId, createdAt',
      messages: '++id, conversationId, timestamp, branchId',
      messageVersions: '++id, messageId, timestamp',
      settings: 'key',
      ideaSessions: '++id, groupId, timestamp, status, createdAt',
      ideaConversations: '++id, sessionId, createdAt',
      ideaMessages: '++id, conversationId, timestamp'
    }).upgrade(async tx => {
      console.log('[DB] 升级数据库到版本 9，新增 ideaConversations 表')

      // 迁移现有 ideaMessages：为每个有消息的 session 创建默认对话
      const oldMessages = await tx.table('ideaMessages').toArray()
      if (oldMessages.length === 0) return

      // 按 sessionId 分组
      const sessionMessages = new Map<number, any[]>()
      for (const msg of oldMessages) {
        const sid = (msg as any).sessionId
        if (!sessionMessages.has(sid)) {
          sessionMessages.set(sid, [])
        }
        sessionMessages.get(sid)!.push(msg)
      }

      // 为每个 session 创建默认对话并迁移消息
      const ideaConversations = tx.table('ideaConversations')
      const ideaMessages = tx.table('ideaMessages')

      for (const [sessionId, messages] of sessionMessages) {
        // 创建默认对话
        const now = new Date()
        const convId = await ideaConversations.add({
          sessionId,
          title: '默认对话',
          createdAt: now,
          updatedAt: now
        })

        // 更新消息关联到新的 conversationId
        for (const msg of messages) {
          await ideaMessages.update(msg.id, { conversationId: convId })
        }
      }

      console.log(`[DB] 迁移完成：${sessionMessages.size} 个会话，${oldMessages.length} 条消息`)
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

  // 删除缓存元数据（远端缓存由 cacheService.cleanupPaperCache 清理）
  await db.settings.delete(`paper_cache_${paperId}`)
}

/**
 * 更新论文标题（保持localPath不变）
 */
export async function updatePaperTitle(paperId: number, newTitle: string): Promise<void> {
  await db.papers.update(paperId, {
    title: newTitle.trim(),
    updatedAt: new Date()
  })
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
 * 重命名分组，并同步更新相关 Idea 会话冗余字段
 * - 更新 groups.name
 * - 更新 ideaSessions.groupName
 * - 若 ideaSessions.localPath 以旧分组名开头，则替换为新分组名
 */
export async function renameGroupWithIdeaSessions(
  id: number,
  newName: string
): Promise<{ oldName: string; newName: string }> {
  const group = await db.groups.get(id)
  const oldName = group?.name || ''
  const trimmedNewName = newName.trim()

  await db.groups.update(id, { name: trimmedNewName })

  if (oldName && oldName !== trimmedNewName) {
    await db.ideaSessions
      .where('groupId')
      .equals(id)
      .modify(session => {
        session.groupName = trimmedNewName
        if (session.localPath?.startsWith(`${oldName}/`)) {
          session.localPath = session.localPath.replace(
            new RegExp(`^${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`),
            `${trimmedNewName}/`
          )
        }
      })
  } else {
    await db.ideaSessions
      .where('groupId')
      .equals(id)
      .modify({ groupName: trimmedNewName })
  }

  return { oldName, newName: trimmedNewName }
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
 * 删除 Idea 会话及其所有对话和消息（级联删除）
 */
export async function deleteIdeaSession(sessionId: number): Promise<void> {
  // 获取该 session 下的所有对话
  const conversations = await db.ideaConversations
    .where('sessionId')
    .equals(sessionId)
    .toArray()

  // 删除每个对话的消息
  for (const conv of conversations) {
    await db.ideaMessages.where('conversationId').equals(conv.id!).delete()
  }

  // 删除对话
  await db.ideaConversations.where('sessionId').equals(sessionId).delete()

  // 删除 session
  await db.ideaSessions.delete(sessionId)
}

/**
 * 获取所有 Idea 会话（按时间倒序）
 */
export async function getAllIdeaSessions(): Promise<IdeaSession[]> {
  return db.ideaSessions.orderBy('createdAt').reverse().toArray()
}

// ========== Idea 对话会话函数 ==========

/**
 * 获取 Idea Session 的所有对话（按更新时间倒序）
 */
export async function getIdeaConversations(sessionId: number): Promise<IdeaConversation[]> {
  const convs = await db.ideaConversations
    .where('sessionId')
    .equals(sessionId)
    .toArray()
  // 按更新时间倒序排列
  return convs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

/**
 * 创建 Idea 对话
 */
export async function createIdeaConversation(sessionId: number, title: string = '新对话'): Promise<number> {
  const now = new Date()
  return await db.ideaConversations.add({
    sessionId,
    title,
    createdAt: now,
    updatedAt: now
  })
}

/**
 * 重命名 Idea 对话
 */
export async function renameIdeaConversation(conversationId: number, newTitle: string): Promise<void> {
  await db.ideaConversations.update(conversationId, {
    title: newTitle.trim(),
    updatedAt: new Date()
  })
}

/**
 * 删除 Idea 对话及其消息
 */
export async function deleteIdeaConversation(conversationId: number): Promise<void> {
  await db.ideaMessages.where('conversationId').equals(conversationId).delete()
  await db.ideaConversations.delete(conversationId)
}

/**
 * 更新 Idea 对话时间
 */
export async function updateIdeaConversationTime(conversationId: number): Promise<void> {
  await db.ideaConversations.update(conversationId, {
    updatedAt: new Date()
  })
}

// ========== Idea 对话消息函数 ==========

/**
 * 获取 Idea 对话的所有消息
 */
export async function getIdeaMessages(conversationId: number): Promise<IdeaMessage[]> {
  return db.ideaMessages
    .where('conversationId')
    .equals(conversationId)
    .sortBy('timestamp')
}

/**
 * 保存 Idea 对话消息
 */
export async function saveIdeaMessage(message: Omit<IdeaMessage, 'id'>): Promise<number> {
  // 同时更新对话的 updatedAt
  await updateIdeaConversationTime(message.conversationId)
  return await db.ideaMessages.add(message as IdeaMessage)
}

/**
 * 删除 Idea 对话的所有消息
 */
export async function deleteIdeaMessages(conversationId: number): Promise<void> {
  await db.ideaMessages.where('conversationId').equals(conversationId).delete()
}

/**
 * 导出 Idea 对话为 Markdown
 */
export async function exportIdeaChat(conversationId: number): Promise<string> {
  const conversation = await db.ideaConversations.get(conversationId)
  if (!conversation) {
    throw new Error('对话不存在')
  }

  const session = await db.ideaSessions.get(conversation.sessionId)

  const messages = await getIdeaMessages(conversationId)

  const lines: string[] = []

  lines.push(`# ${conversation.title}`)
  lines.push('')
  if (session) {
    lines.push(`**分组**: ${session.groupName}`)
  }
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

// ========== 消息版本历史函数 ==========

/**
 * 保存消息版本（在重新生成前调用）
 */
export async function saveMessageVersion(message: Message): Promise<number> {
  const version: Omit<MessageVersion, 'id'> = {
    messageId: message.id!,
    content: message.content,
    thoughts: message.thoughts,
    thinkingTimeMs: message.thinkingTimeMs,
    timestamp: message.timestamp
  }
  return await db.messageVersions.add(version as MessageVersion)
}

/**
 * 获取消息的所有历史版本
 */
export async function getMessageVersions(messageId: number): Promise<MessageVersion[]> {
  return db.messageVersions
    .where('messageId')
    .equals(messageId)
    .sortBy('timestamp')
}

/**
 * 获取消息的版本数量
 */
export async function getMessageVersionCount(messageId: number): Promise<number> {
  return db.messageVersions
    .where('messageId')
    .equals(messageId)
    .count()
}

/**
 * 删除消息的所有历史版本（当消息被删除时调用）
 */
export async function deleteMessageVersions(messageId: number): Promise<void> {
  await db.messageVersions.where('messageId').equals(messageId).delete()
}

// ========== 分支功能函数 ==========

/**
 * 分支信息
 */
export interface BranchInfo {
  branchId: number
  parentMessageId?: number  // 分支起点消息 ID
  messageCount: number      // 分支中的消息数量
}

/**
 * 获取对话的所有分支信息
 */
export async function getConversationBranches(conversationId: number): Promise<BranchInfo[]> {
  const messages = await db.messages
    .where('conversationId')
    .equals(conversationId)
    .toArray()

  // 统计每个分支的消息数量
  const branchMap = new Map<number, { parentMessageId?: number; count: number }>()

  for (const msg of messages) {
    const branchId = msg.branchId ?? 0
    const existing = branchMap.get(branchId)
    if (existing) {
      existing.count++
    } else {
      branchMap.set(branchId, {
        parentMessageId: msg.parentMessageId,
        count: 1
      })
    }
  }

  return Array.from(branchMap.entries()).map(([branchId, info]) => ({
    branchId,
    parentMessageId: info.parentMessageId,
    messageCount: info.count
  })).sort((a, b) => a.branchId - b.branchId)
}

/**
 * 创建新分支
 * 从指定消息位置创建一个新分支，返回新分支 ID
 * parentMessageId 用于记录分支起点，调用者需在新消息中设置此值
 */
export async function createBranch(
  conversationId: number,
  _parentMessageId: number
): Promise<number> {
  // 获取当前对话
  const conversation = await db.conversations.get(conversationId)
  if (!conversation) {
    throw new Error('对话不存在')
  }

  // 计算新分支 ID
  const newBranchId = (conversation.branchCount ?? 0) + 1

  // 更新对话的分支计数和活跃分支
  await db.conversations.update(conversationId, {
    branchCount: newBranchId,
    activeBranchId: newBranchId
  })

  return newBranchId
}

/**
 * 切换活跃分支
 */
export async function switchBranch(
  conversationId: number,
  branchId: number
): Promise<void> {
  await db.conversations.update(conversationId, {
    activeBranchId: branchId
  })
}

/**
 * 获取指定分支的消息
 * 如果是非主分支，会包含主分支到分支起点的消息 + 分支本身的消息
 */
export async function getBranchMessages(
  conversationId: number,
  branchId: number
): Promise<Message[]> {
  const allMessages = await db.messages
    .where('conversationId')
    .equals(conversationId)
    .sortBy('timestamp')

  if (branchId === 0) {
    // 主分支：只返回 branchId 为 0 或 undefined 的消息
    return allMessages.filter(m => !m.branchId || m.branchId === 0)
  }

  // 非主分支：找到分支起点，返回主分支到起点 + 分支消息
  const branchMessages = allMessages.filter(m => m.branchId === branchId)
  if (branchMessages.length === 0) {
    return []
  }

  // 找到分支起点（第一条消息的 parentMessageId）
  const firstBranchMessage = branchMessages[0]
  const parentMessageId = firstBranchMessage.parentMessageId

  if (!parentMessageId) {
    // 如果没有父消息，只返回分支消息
    return branchMessages
  }

  // 获取主分支消息直到父消息（包含父消息）
  const mainBranchMessages = allMessages.filter(m => {
    if (m.branchId && m.branchId !== 0) return false
    return m.timestamp <= (allMessages.find(x => x.id === parentMessageId)?.timestamp ?? 0)
  })

  return [...mainBranchMessages, ...branchMessages]
}

/**
 * 获取对话当前活跃分支 ID
 */
export async function getActiveBranchId(conversationId: number): Promise<number> {
  const conversation = await db.conversations.get(conversationId)
  return conversation?.activeBranchId ?? 0
}

/**
 * 检查消息是否有分支
 */
export async function hasMessageBranches(
  conversationId: number,
  messageId: number
): Promise<boolean> {
  // 查找以此消息为父消息的分支消息
  const branchMessages = await db.messages
    .where('conversationId')
    .equals(conversationId)
    .filter(m => m.parentMessageId === messageId)
    .toArray()

  return branchMessages.length > 0
}

/**
 * 获取从指定消息分出的所有分支 ID
 */
export async function getBranchesFromMessage(
  conversationId: number,
  messageId: number
): Promise<number[]> {
  const branchMessages = await db.messages
    .where('conversationId')
    .equals(conversationId)
    .filter(m => m.parentMessageId === messageId)
    .toArray()

  const branchIds = new Set<number>()
  for (const msg of branchMessages) {
    if (msg.branchId) {
      branchIds.add(msg.branchId)
    }
  }

  return Array.from(branchIds).sort((a, b) => a - b)
}
