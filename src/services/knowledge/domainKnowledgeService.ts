import mammoth from 'mammoth'
import { GoogleGenAI } from '@google/genai'
import { getAPIKey, getGeminiSettings } from '../storage/db'
import {
  saveDomainKnowledge as saveToDisk,
  loadDomainKnowledge as loadFromDisk,
  hasDomainKnowledge as checkExists
} from '../storage/fileSystem'

async function loadPrompt(filename: string): Promise<string> {
  const response = await fetch(`/prompts/${filename}`)
  if (!response.ok) {
    throw new Error(`无法加载提示词文件: ${filename}`)
  }
  return await response.text()
}

/**
 * 解析 docx 文件为纯文本
 */
export async function parseDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

/**
 * AI 整理领域知识
 * 合并现有内容和新增内容，去重并保留全部信息
 */
export async function organizeKnowledge(
  existingContent: string,
  newContent: string,
  onStream?: (text: string) => void
): Promise<string> {
  const apiKey = await getAPIKey('gemini')
  if (!apiKey) {
    throw new Error('未配置 Gemini API Key')
  }

  const settings = await getGeminiSettings()
  const ai = new GoogleGenAI({ apiKey })
  const systemPrompt = await loadPrompt('organize_domain_knowledge.md')

  const userContent = existingContent
    ? `## 现有领域知识\n${existingContent}\n\n## 新增内容\n${newContent}`
    : newContent

  let fullText = ''

  if (settings.streaming && onStream) {
    const response = await ai.models.generateContentStream({
      model: 'gemini-2.5-pro',
      contents: userContent,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1,
        thinkingConfig: {
          thinkingBudget: -1,
          includeThoughts: false
        }
      }
    })

    for await (const chunk of response) {
      const chunkText = chunk.text || ''
      fullText += chunkText
      onStream(fullText)
    }
  } else {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: userContent,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1,
        thinkingConfig: {
          thinkingBudget: -1,
          includeThoughts: false
        }
      }
    })
    fullText = response.text || ''
  }

  return fullText
}

/**
 * 保存领域知识
 */
export async function saveDomainKnowledge(groupName: string, content: string): Promise<void> {
  await saveToDisk(groupName, content)
}

/**
 * 加载领域知识
 */
export async function loadDomainKnowledge(groupName: string): Promise<string | null> {
  return await loadFromDisk(groupName)
}

/**
 * 检查领域知识是否存在
 */
export async function hasDomainKnowledge(groupName: string): Promise<boolean> {
  return await checkExists(groupName)
}
