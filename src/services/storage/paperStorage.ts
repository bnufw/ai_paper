/**
 * 论文本地存储服务
 * 负责将论文、PDF和图片保存到用户本地文件系统
 */

import {
  getDirectoryHandle,
  createDirectory,
  writeTextFile,
  writeBinaryFile,
  readBinaryFile,
  deleteDirectory,
  readTextFile
} from './fileSystem'

/**
 * 图片数据类型
 */
export interface ImageData {
  index: number
  data: string  // base64 或 data URL
}

/**
 * 保存论文到本地文件系统
 * @param groupName 分组名称（未分类时传入 "未分类"）
 * @param title 论文标题
 * @param pdfFile PDF 文件对象
 * @param markdown Markdown 内容
 * @param images 图片数据数组
 * @returns 本地路径（相对于根目录）
 */
export async function savePaperToLocal(
  groupName: string,
  title: string,
  pdfFile: File,
  markdown: string,
  images: ImageData[] = []
): Promise<string> {
  const rootHandle = await getDirectoryHandle()

  if (!rootHandle) {
    throw new Error('未配置存储目录,请先在设置中选择存储位置')
  }

  // 生成唯一文件夹名（避免冲突）
  const sanitizedTitle = sanitizeFilename(title)
  const timestamp = Date.now()
  const folderName = `${sanitizedTitle}_${timestamp}`

  // 创建目录结构: 分组/论文/
  const localPath = `${groupName}/${folderName}`
  const paperDirHandle = await createDirectory(rootHandle, localPath)

  // 保存 PDF 原文
  const pdfBuffer = await pdfFile.arrayBuffer()
  await writeBinaryFile(paperDirHandle, 'source.pdf', pdfBuffer)

  // 保存 Markdown 文件
  await writeTextFile(paperDirHandle, 'paper.md', markdown)

  // 保存图片到 images 子目录
  if (images.length > 0) {
    const imagesDirHandle = await createDirectory(rootHandle, `${localPath}/images`)
    for (const img of images) {
      const blob = base64ToBlob(img.data)
      await writeBinaryFile(imagesDirHandle, `image_${img.index}.png`, blob)
    }
  }

  return localPath
}

/**
 * 将 base64 字符串转换为 Blob
 */
function base64ToBlob(base64: string): Blob {
  // 处理 data URL 格式
  let pureBase64 = base64
  let mimeType = 'image/png'

  if (base64.startsWith('data:')) {
    const match = base64.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      mimeType = match[1]
      pureBase64 = match[2]
    }
  }

  const byteCharacters = atob(pureBase64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mimeType })
}

/**
 * 清理文件名中的非法字符
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100)
}

/**
 * 从本地读取 PDF 文件
 */
export async function loadPDFFromLocal(localPath: string): Promise<ArrayBuffer> {
  const rootHandle = await getDirectoryHandle()
  
  if (!rootHandle) {
    throw new Error('未配置存储目录')
  }

  const paperDirHandle = await createDirectory(rootHandle, localPath)
  return await readBinaryFile(paperDirHandle, 'source.pdf')
}

/**
 * 从本地读取完整 Markdown（包含图片）
 */
export async function loadMarkdownFromLocal(localPath: string): Promise<string> {
  const rootHandle = await getDirectoryHandle()

  if (!rootHandle) {
    throw new Error('未配置存储目录')
  }

  const paperDirHandle = await createDirectory(rootHandle, localPath)
  const markdown = await readTextFile(paperDirHandle, 'paper.md')

  return markdown
}

/**
 * 从本地读取图片（返回 base64 data URL）
 */
export async function loadImageFromLocal(localPath: string, imageIndex: number): Promise<string | null> {
  const rootHandle = await getDirectoryHandle()

  if (!rootHandle) {
    return null
  }

  try {
    const imagesDirHandle = await createDirectory(rootHandle, `${localPath}/images`)
    const buffer = await readBinaryFile(imagesDirHandle, `image_${imageIndex}.png`)
    const blob = new Blob([buffer], { type: 'image/png' })
    return await blobToDataURL(blob)
  } catch {
    return null
  }
}

/**
 * 从本地批量读取所有图片
 */
export async function loadAllImagesFromLocal(localPath: string): Promise<Map<number, string>> {
  const rootHandle = await getDirectoryHandle()
  const images = new Map<number, string>()

  if (!rootHandle) {
    return images
  }

  try {
    const imagesDirHandle = await createDirectory(rootHandle, `${localPath}/images`)

    // 遍历 images 目录
    for await (const entry of (imagesDirHandle as any).values()) {
      if (entry.kind === 'file' && entry.name.startsWith('image_') && entry.name.endsWith('.png')) {
        const match = entry.name.match(/image_(\d+)\.png/)
        if (match) {
          const index = parseInt(match[1])
          const fileHandle = await imagesDirHandle.getFileHandle(entry.name)
          const file = await fileHandle.getFile()
          const dataURL = await blobToDataURL(file)
          images.set(index, dataURL)
        }
      }
    }
  } catch {
    // images 目录不存在，返回空 map
  }

  return images
}

/**
 * Blob 转 data URL
 */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * 删除本地论文文件
 */
export async function deletePaperFromLocal(localPath: string): Promise<void> {
  const rootHandle = await getDirectoryHandle()
  
  if (!rootHandle) {
    return
  }

  const parts = localPath.split('/').filter(Boolean)
  const folderName = parts.pop()!
  const groupPath = parts.join('/')
  
  const groupHandle = await createDirectory(rootHandle, groupPath)
  await deleteDirectory(groupHandle, folderName)
}

/**
 * 保存笔记到本地
 */
export async function saveNoteToLocal(localPath: string, content: string): Promise<void> {
  const rootHandle = await getDirectoryHandle()

  if (!rootHandle) {
    throw new Error('未配置存储目录')
  }

  const paperDirHandle = await createDirectory(rootHandle, localPath)
  await writeTextFile(paperDirHandle, 'note.md', content)
}

/**
 * 从本地读取笔记
 */
export async function loadNoteFromLocal(localPath: string): Promise<string | null> {
  const rootHandle = await getDirectoryHandle()

  if (!rootHandle) {
    return null
  }

  try {
    const paperDirHandle = await createDirectory(rootHandle, localPath)
    return await readTextFile(paperDirHandle, 'note.md')
  } catch {
    return null
  }
}

/**
 * 检查笔记是否存在
 */
export async function hasNoteLocal(localPath: string): Promise<boolean> {
  const note = await loadNoteFromLocal(localPath)
  return note !== null
}

/**
 * 追加内容到笔记
 */
export async function appendNoteToLocal(localPath: string, content: string): Promise<void> {
  const existingNote = await loadNoteFromLocal(localPath)
  const timestamp = new Date().toLocaleString('zh-CN')
  const separator = `\n\n---\n\n*从对话添加于 ${timestamp}*\n\n`
  
  const newContent = existingNote 
    ? existingNote + separator + content
    : `# 笔记\n\n${content}`
  
  await saveNoteToLocal(localPath, newContent)
}


