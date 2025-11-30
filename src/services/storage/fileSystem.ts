/**
 * 文件系统服务 - 使用 File System Access API
 * 管理论文的本地文件存储
 */

const DIRECTORY_HANDLE_KEY = 'rootDirectoryHandle'

/**
 * 检查浏览器是否支持 File System Access API
 */
export function isFileSystemSupported(): boolean {
  return 'showDirectoryPicker' in window
}

/**
 * 请求用户授权访问目录
 */
export async function requestDirectoryAccess(): Promise<FileSystemDirectoryHandle> {
  if (!isFileSystemSupported()) {
    throw new Error('当前浏览器不支持文件系统访问,请使用 Chrome 或 Edge 浏览器')
  }

  const handle = await (window as any).showDirectoryPicker({
    mode: 'readwrite'
  })

  await saveDirectoryHandle(handle)
  return handle
}

/**
 * 检查目录权限是否有效
 */
export async function checkDirectoryPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const permission = await (handle as any).queryPermission({ mode: 'readwrite' })
  if (permission === 'granted') {
    return true
  }

  if (permission === 'prompt') {
    const newPermission = await (handle as any).requestPermission({ mode: 'readwrite' })
    return newPermission === 'granted'
  }

  return false
}

/**
 * 持久化存储目录句柄到 IndexedDB
 */
async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDB()
  const tx = db.transaction('handles', 'readwrite')
  await tx.objectStore('handles').put(handle, DIRECTORY_HANDLE_KEY)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * 从 IndexedDB 恢复目录句柄
 */
export async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openHandleDB()
  const tx = db.transaction('handles', 'readonly')
  const request = tx.objectStore('handles').get(DIRECTORY_HANDLE_KEY)
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 打开存储句柄的 IndexedDB
 */
function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('FileSystemHandles', 1)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles')
      }
    }
  })
}

/**
 * 创建目录（支持嵌套）
 */
export async function createDirectory(
  rootHandle: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemDirectoryHandle> {
  const parts = path.split('/').filter(Boolean)
  let currentHandle = rootHandle

  for (const part of parts) {
    currentHandle = await currentHandle.getDirectoryHandle(part, { create: true })
  }

  return currentHandle
}

/**
 * 写入文本文件
 */
export async function writeTextFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  content: string
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

/**
 * 写入二进制文件（PDF）
 */
export async function writeBinaryFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  data: ArrayBuffer | Blob
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}

/**
 * 读取文本文件
 */
export async function readTextFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string
): Promise<string> {
  const fileHandle = await dirHandle.getFileHandle(filename)
  const file = await fileHandle.getFile()
  return await file.text()
}

/**
 * 读取二进制文件（PDF）
 */
export async function readBinaryFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string
): Promise<ArrayBuffer> {
  const fileHandle = await dirHandle.getFileHandle(filename)
  const file = await fileHandle.getFile()
  return await file.arrayBuffer()
}

/**
 * 删除目录及其内容
 */
export async function deleteDirectory(
  parentHandle: FileSystemDirectoryHandle,
  dirName: string
): Promise<void> {
  await parentHandle.removeEntry(dirName, { recursive: true })
}

/**
 * 重命名目录
 */
export async function renameDirectory(
  rootHandle: FileSystemDirectoryHandle,
  oldPath: string,
  newPath: string
): Promise<void> {
  const oldParts = oldPath.split('/').filter(Boolean)
  const newParts = newPath.split('/').filter(Boolean)
  
  const oldName = oldParts.pop()!
  const newName = newParts.pop()!
  
  const parentHandle = await createDirectory(rootHandle, oldParts.join('/'))
  const oldDirHandle = await parentHandle.getDirectoryHandle(oldName)
  
  const newParentHandle = await createDirectory(rootHandle, newParts.join('/'))
  await copyDirectory(oldDirHandle, newParentHandle, newName)
  
  await parentHandle.removeEntry(oldName, { recursive: true })
}

/**
 * 复制目录（重命名时使用）
 */
async function copyDirectory(
  sourceHandle: FileSystemDirectoryHandle,
  targetParentHandle: FileSystemDirectoryHandle,
  targetName: string
): Promise<void> {
  const targetHandle = await targetParentHandle.getDirectoryHandle(targetName, { create: true })

  for await (const entry of (sourceHandle as any).values()) {
    if (entry.kind === 'file') {
      const fileHandle = await sourceHandle.getFileHandle(entry.name)
      const file = await fileHandle.getFile()
      const newFileHandle = await targetHandle.getFileHandle(entry.name, { create: true })
      const writable = await newFileHandle.createWritable()
      await writable.write(file)
      await writable.close()
    } else if (entry.kind === 'directory') {
      const subDirHandle = await sourceHandle.getDirectoryHandle(entry.name)
      await copyDirectory(subDirHandle, targetHandle, entry.name)
    }
  }
}

/**
 * 获取目录路径名称
 */
export async function getDirectoryPath(handle: FileSystemDirectoryHandle): Promise<string> {
  return handle.name
}
