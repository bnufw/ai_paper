/**
 * 工作流文件存储服务
 * 管理 Idea 工作流的本地文件存储
 */

import {
  getDirectoryHandle,
  createDirectory,
  writeTextFile,
  readTextFile,
  checkDirectoryPermission
} from '../storage/fileSystem'
import { db, exportIdeaChat } from '../storage/db'

/**
 * 生成时间戳字符串 (YYYY-MM-DD-HH-MM-SS)
 */
export function generateTimestamp(): string {
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('-')
}

/**
 * 获取分组名称
 */
export async function getGroupName(groupId: number): Promise<string> {
  const group = await db.groups.get(groupId)
  return group?.name || '未知分组'
}

/**
 * 创建工作流会话目录
 * 结构: {groupName}/ideas/{timestamp}/
 */
export async function createWorkflowDirectory(
  groupName: string,
  timestamp: string
): Promise<{ handle: FileSystemDirectoryHandle; path: string }> {
  const rootHandle = await getDirectoryHandle()
  if (!rootHandle) {
    throw new Error('未配置存储目录，请先设置本地存储位置')
  }

  const hasPermission = await checkDirectoryPermission(rootHandle)
  if (!hasPermission) {
    throw new Error('存储目录访问权限已失效，请重新授权')
  }

  // 创建目录结构: {groupName}/ideas/{timestamp}/
  const relativePath = `${groupName}/ideas/${timestamp}`
  const sessionDir = await createDirectory(rootHandle, relativePath)

  // 创建子目录
  await createDirectory(sessionDir, 'ideas')
  await createDirectory(sessionDir, 'reviews')

  return { handle: sessionDir, path: relativePath }
}

/**
 * 保存生成的 Idea（文件名包含索引和模型名）
 */
export async function saveIdea(
  sessionDir: FileSystemDirectoryHandle,
  index: number,
  slug: string,
  content: string
): Promise<void> {
  const ideasDir = await sessionDir.getDirectoryHandle('ideas')
  const filename = `idea_${index}_${sanitizeFilename(slug)}.md`
  await writeTextFile(ideasDir, filename, content)
}

/**
 * 保存评审结果
 */
export async function saveReview(
  sessionDir: FileSystemDirectoryHandle,
  slug: string,
  content: string
): Promise<void> {
  const reviewsDir = await sessionDir.getDirectoryHandle('reviews')
  const filename = `review_${sanitizeFilename(slug)}.md`
  await writeTextFile(reviewsDir, filename, content)
}

/**
 * 保存最佳 Idea
 */
export async function saveBestIdea(
  sessionDir: FileSystemDirectoryHandle,
  content: string
): Promise<void> {
  await writeTextFile(sessionDir, 'best_idea.md', content)
}

/**
 * Idea 条目，包含索引、模型名和内容
 */
export interface IdeaEntry {
  index: number
  slug: string
  content: string
}

/**
 * 读取会话目录中的所有 Idea
 * 文件名格式: idea_{index}_{slug}.md
 * 返回包含索引和模型名的数组，按索引排序
 */
export async function readAllIdeas(
  sessionDir: FileSystemDirectoryHandle
): Promise<IdeaEntry[]> {
  const ideas: IdeaEntry[] = []

  try {
    const ideasDir = await sessionDir.getDirectoryHandle('ideas')

    for await (const entry of (ideasDir as any).values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        const content = await readTextFile(ideasDir, entry.name)
        // 从文件名提取索引和 slug: idea_1_gemini_2_5_pro.md -> index=1, slug=gemini_2_5_pro
        const match = entry.name.match(/^idea_(\d+)_(.+)\.md$/)
        if (match) {
          ideas.push({
            index: parseInt(match[1], 10),
            slug: match[2],
            content
          })
        }
      }
    }
  } catch (e) {
    console.warn('读取 ideas 目录失败:', e)
  }

  // 按索引排序
  return ideas.sort((a, b) => a.index - b.index)
}

/**
 * 读取会话目录中的所有评审
 */
export async function readAllReviews(
  sessionDir: FileSystemDirectoryHandle
): Promise<Map<string, string>> {
  const reviews = new Map<string, string>()

  try {
    const reviewsDir = await sessionDir.getDirectoryHandle('reviews')

    for await (const entry of (reviewsDir as any).values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        const content = await readTextFile(reviewsDir, entry.name)
        const slug = entry.name.replace(/^review_/, '').replace(/\.md$/, '')
        reviews.set(slug, content)
      }
    }
  } catch (e) {
    console.warn('读取 reviews 目录失败:', e)
  }

  return reviews
}

/**
 * 读取最佳 Idea
 */
export async function readBestIdea(
  sessionDir: FileSystemDirectoryHandle
): Promise<string | null> {
  try {
    return await readTextFile(sessionDir, 'best_idea.md')
  } catch (e) {
    return null
  }
}

/**
 * 获取会话目录句柄
 */
export async function getSessionDirectory(
  relativePath: string
): Promise<FileSystemDirectoryHandle | null> {
  const rootHandle = await getDirectoryHandle()
  if (!rootHandle) return null

  try {
    const hasPermission = await checkDirectoryPermission(rootHandle)
    if (!hasPermission) return null

    return await createDirectory(rootHandle, relativePath)
  } catch (e) {
    console.warn('获取会话目录失败:', e)
    return null
  }
}

/**
 * 收集分组下所有论文的笔记内容
 */
export async function collectGroupNotes(groupId: number): Promise<string> {
  const rootHandle = await getDirectoryHandle()
  if (!rootHandle) {
    throw new Error('未配置存储目录')
  }

  const hasPermission = await checkDirectoryPermission(rootHandle)
  if (!hasPermission) {
    throw new Error('存储目录访问权限已失效')
  }

  // 获取分组下的所有论文
  const papers = await db.papers.where('groupId').equals(groupId).toArray()

  if (papers.length === 0) {
    throw new Error('该分组下没有论文')
  }

  const notes: string[] = []

  for (const paper of papers) {
    if (!paper.localPath) continue

    try {
      // 尝试读取笔记文件
      const paperDir = await createDirectory(rootHandle, paper.localPath)
      const noteContent = await readTextFile(paperDir, 'note.md')

      if (noteContent.trim()) {
        notes.push(`# 论文：${paper.title}\n\n${noteContent}`)
      }
    } catch (e) {
      // 笔记文件不存在，跳过
      console.warn(`论文 "${paper.title}" 没有笔记文件`)
    }
  }

  if (notes.length === 0) {
    throw new Error('该分组下的论文都没有笔记内容，请先为论文生成笔记')
  }

  return notes.join('\n\n---\n\n')
}

/**
 * 清理文件名（移除特殊字符，防止路径遍历攻击）
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/\.\./g, '')           // 移除路径遍历
    .replace(/[\/\\]/g, '')         // 移除路径分隔符
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')   // 只保留安全字符
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 200)              // 限制长度
}

/**
 * 合并多个 Idea 为评审输入（仅用数字编号标识）
 */
export function formatIdeasForReview(ideas: Map<string, string>): string {
  const sections: string[] = []
  let index = 1

  for (const [, content] of ideas) {
    sections.push(`========== Idea ${index} ==========\n\n${content}`)
    index++
  }

  return sections.join('\n\n')
}

/**
 * 合并评审报告为筛选输入（仅包含评审报告，用数字编号标识评审来源）
 */
export function formatForSummarizer(
  _ideas: Map<string, string>,
  reviews: Map<string, string>
): string {
  const sections: string[] = []
  let index = 1

  sections.push('# 评审报告汇总\n')
  for (const [, content] of reviews) {
    sections.push(`## 评审 ${index}\n\n${content}`)
    index++
  }

  return sections.join('\n\n')
}

/**
 * 收集生成器的完整上下文
 * 整合：领域知识 + 论文笔记 + 用户研究方向
 */
export async function collectGeneratorContext(
  groupId: number,
  groupName: string,
  userIdea: string
): Promise<string> {
  const sections: string[] = []

  // 1. 领域知识（背景知识）
  const domainKnowledge = await loadDomainKnowledge(groupName)
  if (domainKnowledge) {
    sections.push(`# 领域知识\n\n${domainKnowledge}`)
  }

  // 2. 论文笔记（具体材料）
  const notes = await collectGroupNotes(groupId)
  sections.push(`# 论文笔记\n\n${notes}`)

  // 3. 用户输入（放在最后，作为任务指令）
  if (userIdea.trim()) {
    sections.push(`# 研究方向与目标\n\n${userIdea}`)
  }

  return sections.join('\n\n---\n\n')
}

/**
 * 加载领域知识
 */
async function loadDomainKnowledge(groupName: string): Promise<string | null> {
  const rootHandle = await getDirectoryHandle()
  if (!rootHandle) return null

  try {
    const hasPermission = await checkDirectoryPermission(rootHandle)
    if (!hasPermission) return null

    const groupDir = await rootHandle.getDirectoryHandle(groupName)
    return await readTextFile(groupDir, 'domain_knowledge.md')
  } catch {
    return null
  }
}

/**
 * 导出 Idea 对话到会话目录
 * 保存为 chat_history.md
 */
export async function exportIdeaChatToFile(sessionId: number, localPath: string): Promise<void> {
  const sessionDir = await getSessionDirectory(localPath)
  if (!sessionDir) {
    throw new Error('无法访问会话目录')
  }

  const content = await exportIdeaChat(sessionId)
  await writeTextFile(sessionDir, 'chat_history.md', content)
}
