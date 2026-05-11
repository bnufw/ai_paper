import { convertPDFToMarkdown } from '../pdf/mistralOCR'
import { createPaper, getAllGroups, type PaperSourceMetadata } from '../storage/db'
import { getDirectoryHandle } from '../storage/fileSystem'
import { deletePaperFromLocal, savePaperToLocal } from '../storage/paperStorage'
import { extractPaperTitle } from '../../utils/titleExtractor'

interface ProcessAndSavePaperOptions {
  groupId?: number
  titleFallback?: string
  sourceMetadata?: PaperSourceMetadata
  onProgress?: (stage: string, percent: number) => void
}

export async function processAndSavePaper(
  file: File,
  options: ProcessAndSavePaperOptions = {}
): Promise<number> {
  const { groupId, titleFallback, sourceMetadata, onProgress } = options
  let localPath: string | undefined

  try {
    const rootHandle = await getDirectoryHandle()
    if (!rootHandle) {
      throw new Error('未配置存储目录,请先在设置中选择存储位置')
    }

    const ocrResult = await convertPDFToMarkdown(file, (stage, percent) => {
      onProgress?.(stage, Math.round((percent || 0) * 0.8))
    })

    const fallbackTitle = titleFallback || file.name.replace(/\.pdf$/i, '')
    const title = extractPaperTitle(ocrResult.markdown, fallbackTitle)
    const groups = await getAllGroups()
    const selectedGroup = groups.find(group => group.id === groupId)
    const groupName = selectedGroup?.name || '未分类'

    onProgress?.('正在保存到本地...', 90)
    localPath = await savePaperToLocal(
      groupName,
      title,
      file,
      ocrResult.markdown,
      ocrResult.images
    )

    onProgress?.('正在保存元数据...', 95)
    const paperId = await createPaper(
      title,
      ocrResult.markdown,
      [],
      undefined,
      groupId,
      localPath,
      sourceMetadata
    )

    onProgress?.('完成!', 100)
    return paperId
  } catch (error) {
    if (localPath) {
      try {
        await deletePaperFromLocal(localPath)
      } catch (cleanupError) {
        console.error('清理本地论文文件失败:', cleanupError)
      }
    }
    throw error
  }
}
