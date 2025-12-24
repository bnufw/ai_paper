/**
 * 从OCR后的Markdown内容中提取论文标题
 */

import { getAllPapers, updatePaperTitle } from '../services/storage/db'

/**
 * 从Markdown内容中提取论文标题
 * @param markdown OCR后的Markdown内容
 * @param fallbackTitle 提取失败时的备选标题（通常是文件名）
 * @returns 提取的论文标题
 */
export function extractPaperTitle(markdown: string, fallbackTitle: string): string {
  if (!markdown || markdown.trim().length === 0) {
    return fallbackTitle
  }

  const lines = markdown.split('\n').map(line => line.trim()).filter(Boolean)

  // 策略1: 查找H1标题
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i]
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      const title = line.substring(2).trim()
      if (isValidTitle(title)) {
        return cleanTitle(title)
      }
    }
  }

  // 策略2: 从前几行文本中识别标题
  // 学术论文标题通常是开头较长的一行文本
  const candidates: string[] = []

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i]

    // 跳过非文本内容
    if (shouldSkipLine(line)) continue

    // 跳过明显的非标题行
    if (isNonTitleLine(line)) continue

    // 收集候选标题
    if (line.length >= 10 && line.length <= 300) {
      candidates.push(line)
    }
  }

  // 选择最合适的候选标题
  if (candidates.length > 0) {
    // 优先选择第一个较长的候选（标题通常在最开头且较长）
    const bestCandidate = candidates[0]
    if (isValidTitle(bestCandidate)) {
      return cleanTitle(bestCandidate)
    }
  }

  return fallbackTitle
}

/**
 * 检查是否应该跳过该行
 */
function shouldSkipLine(line: string): boolean {
  // 跳过图片
  if (line.startsWith('![') || line.includes('](images/')) return true
  // 跳过链接
  if (/^\[.*\]\(.*\)$/.test(line)) return true
  // 跳过分隔线
  if (/^[-=*]{3,}$/.test(line)) return true
  // 跳过代码块
  if (line.startsWith('```')) return true
  // 跳过表格
  if (line.startsWith('|')) return true
  // 跳过H2及以下标题
  if (/^#{2,}\s/.test(line)) return true

  return false
}

/**
 * 检查是否为非标题行（作者、摘要等）
 */
function isNonTitleLine(line: string): boolean {
  const lowerLine = line.toLowerCase()

  // 常见的非标题模式
  const nonTitlePatterns = [
    /^abstract[:\s]/i,
    /^摘\s*要/,
    /^keywords?[:\s]/i,
    /^关键词/,
    /^introduction[:\s]/i,
    /^\d+\.\s*(introduction|abstract)/i,
    /^author[s]?[:\s]/i,
    /^作者/,
    /^@/,  // 邮箱标记
    /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,  // 邮箱
    /^https?:\/\//,  // URL
    /^arxiv:/i,
    /^doi:/i,
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/,  // 日期
    /^received|accepted|published/i,
    /^copyright/i,
    /^©/,
    /^\*/,  // 脚注标记
    /^†|‡|§/,  // 特殊标记
  ]

  for (const pattern of nonTitlePatterns) {
    if (pattern.test(lowerLine)) return true
  }

  // 如果包含多个逗号和"and"，可能是作者列表
  if ((line.match(/,/g) || []).length >= 2 && /\band\b/i.test(line)) {
    return true
  }

  // 如果主要由数字组成（可能是页码、日期等）
  if (/^\d+[\s\d./-]*$/.test(line)) return true

  return false
}

/**
 * 验证标题有效性
 */
function isValidTitle(title: string): boolean {
  if (!title || title.length < 5) return false
  if (title.length > 300) return false

  // 标题应该主要包含字母或中文
  const letterCount = (title.match(/[a-zA-Z\u4e00-\u9fa5]/g) || []).length
  if (letterCount < title.length * 0.3) return false

  return true
}

/**
 * 清理标题
 */
function cleanTitle(title: string): string {
  return title
    .replace(/\*+/g, '')  // 移除markdown加粗/斜体标记
    .replace(/^#+\s*/, '')  // 移除标题标记
    .replace(/\s+/g, ' ')  // 规范化空白
    .trim()
}

export interface BatchUpdateResult {
  total: number
  updated: number
  skipped: number
  details: Array<{
    id: number
    oldTitle: string
    newTitle: string
    status: 'updated' | 'skipped' | 'no-change'
  }>
}

/**
 * 批量更新所有论文的标题
 * @param onProgress 进度回调
 * @returns 更新结果
 */
export async function batchUpdatePaperTitles(
  onProgress?: (current: number, total: number, title: string) => void
): Promise<BatchUpdateResult> {
  const papers = await getAllPapers()
  const result: BatchUpdateResult = {
    total: papers.length,
    updated: 0,
    skipped: 0,
    details: []
  }

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i]
    onProgress?.(i + 1, papers.length, paper.title)

    // 跳过没有 markdown 内容的论文
    if (!paper.markdown || paper.markdown.trim().length === 0) {
      result.skipped++
      result.details.push({
        id: paper.id!,
        oldTitle: paper.title,
        newTitle: paper.title,
        status: 'skipped'
      })
      continue
    }

    const extractedTitle = extractPaperTitle(paper.markdown, paper.title)

    // 如果提取的标题与当前标题相同，跳过
    if (extractedTitle === paper.title) {
      result.details.push({
        id: paper.id!,
        oldTitle: paper.title,
        newTitle: extractedTitle,
        status: 'no-change'
      })
      continue
    }

    // 更新标题
    await updatePaperTitle(paper.id!, extractedTitle)
    result.updated++
    result.details.push({
      id: paper.id!,
      oldTitle: paper.title,
      newTitle: extractedTitle,
      status: 'updated'
    })
  }

  return result
}
