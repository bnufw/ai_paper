import { GoogleGenerativeAI } from '@google/generative-ai'
import { getAPIKey, getGeminiSettings } from '../storage/db'
import { loadMarkdownFromLocal } from '../storage/paperStorage'
import { saveNoteToLocal, loadNoteFromLocal, hasNoteLocal, appendNoteToLocal } from '../storage/paperStorage'

/**
 * 读取笔记生成提示词
 */
async function loadNotePrompt(): Promise<string> {
  try {
    const response = await fetch('/prompts/note.md')
    if (!response.ok) {
      throw new Error('无法加载笔记提示词文件')
    }
    return await response.text()
  } catch (error) {
    console.error('读取笔记提示词失败:', error)
    throw new Error('读取笔记提示词失败')
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
  const genAI = new GoogleGenerativeAI(apiKey)

  const model = genAI.getGenerativeModel({
    model: settings.model === 'gemini-3-pro-preview' ? 'gemini-3-pro-preview' : 'gemini-2.5-pro'
  })

  // 读取论文内容
  const paperContent = await loadMarkdownFromLocal(localPath)
  
  if (!paperContent) {
    throw new Error('无法读取论文内容')
  }

  // 读取笔记提示词
  const systemPrompt = await loadNotePrompt()

  let fullText = ''

  // 流式输出
  if (settings.streaming && onStream) {
    const result = await model.generateContentStream([
      { text: systemPrompt },
      { text: paperContent }
    ])

    for await (const chunk of result.stream) {
      const chunkText = chunk.text()
      fullText += chunkText
      onStream(fullText)
    }
  } else {
    const result = await model.generateContent([
      { text: systemPrompt },
      { text: paperContent }
    ])
    fullText = result.response.text()
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
