import { GoogleGenAI } from '@google/genai'
import { getAPIKey, getGeminiSettings } from '../storage/db'
import { loadMarkdownFromLocal } from '../storage/paperStorage'
import { saveNoteToLocal, loadNoteFromLocal, hasNoteLocal, appendNoteToLocal } from '../storage/paperStorage'

/**
 * 读取提示词文件
 */
async function loadPrompt(filename: string): Promise<string> {
  try {
    const response = await fetch(`/prompts/${filename}`)
    if (!response.ok) {
      throw new Error(`无法加载提示词文件: ${filename}`)
    }
    return await response.text()
  } catch (error) {
    console.error('读取提示词失败:', error)
    throw new Error('读取提示词失败')
  }
}

/**
 * 生成论文笔记
 * @param localPath 论文本地路径
 * @param onStream 流式输出回调
 * @returns 生成的笔记内容
 */
export async function generateNote(
  localPath: string,
  onStream?: (text: string) => void
): Promise<string> {
  const apiKey = await getAPIKey('gemini')

  if (!apiKey) {
    throw new Error('未配置Gemini API Key')
  }

  const settings = await getGeminiSettings()
  const ai = new GoogleGenAI({ apiKey })

  // 读取笔记提示词作为系统指令
  const systemPrompt = await loadPrompt('note.md')

  // 读取论文内容
  const paperContent = await loadMarkdownFromLocal(localPath)

  if (!paperContent) {
    throw new Error('无法读取论文内容')
  }

  let fullText = ''

  // 流式输出
  if (settings.streaming && onStream) {
    const response = await ai.models.generateContentStream({
      model: settings.model,
      contents: paperContent,
      config: {
        systemInstruction: systemPrompt
      }
    })

    for await (const chunk of response) {
      const chunkText = chunk.text || ''
      fullText += chunkText
      onStream(fullText)
    }
  } else {
    const response = await ai.models.generateContent({
      model: settings.model,
      contents: paperContent,
      config: {
        systemInstruction: systemPrompt
      }
    })
    fullText = response.text || ''
  }

  // 保存笔记到本地
  await saveNoteToLocal(localPath, fullText)

  return fullText
}

/**
 * 加载笔记内容
 * @param localPath 论文本地路径
 * @returns 笔记内容,不存在返回 null
 */
export async function loadNote(localPath: string): Promise<string | null> {
  return await loadNoteFromLocal(localPath)
}

/**
 * 保存笔记内容
 * @param localPath 论文本地路径
 * @param content 笔记内容
 */
export async function saveNote(localPath: string, content: string): Promise<void> {
  await saveNoteToLocal(localPath, content)
}

/**
 * 检查笔记是否存在
 * @param localPath 论文本地路径
 * @returns 是否存在笔记
 */
export async function hasNote(localPath: string): Promise<boolean> {
  return await hasNoteLocal(localPath)
}

/**
 * 追加内容到笔记
 * @param localPath 论文本地路径
 * @param content 要追加的内容
 */
export async function appendToNote(localPath: string, content: string): Promise<void> {
  await appendNoteToLocal(localPath, content)
}

/**
 * AI整理笔记内容
 * 将"从对话添加xxx"的部分融入笔记主体
 * @param localPath 论文本地路径
 * @param currentContent 当前笔记内容
 * @param onStream 流式输出回调
 * @returns 整理后的笔记内容
 */
export async function organizeNote(
  localPath: string,
  currentContent: string,
  onStream?: (text: string) => void
): Promise<string> {
  const apiKey = await getAPIKey('gemini')

  if (!apiKey) {
    throw new Error('未配置Gemini API Key')
  }

  if (!currentContent.trim()) {
    throw new Error('笔记内容为空')
  }

  const settings = await getGeminiSettings()
  const ai = new GoogleGenAI({ apiKey })

  const systemPrompt = await loadPrompt('organize_note.md')

  let fullText = ''

  if (settings.streaming && onStream) {
    const response = await ai.models.generateContentStream({
      model: 'gemini-2.5-pro',
      contents: currentContent,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1
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
      contents: currentContent,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1
      }
    })
    fullText = response.text || ''
  }

  await saveNoteToLocal(localPath, fullText)

  return fullText
}
