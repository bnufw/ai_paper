import { useEffect, useState } from 'react'
import { db, type Paper } from '../../services/storage/db'
import { loadPDFFromLocal } from '../../services/storage/paperStorage'

interface PDFViewerProps {
  paperId: number
}

export default function PDFViewer({ paperId }: PDFViewerProps) {
  const [paper, setPaper] = useState<Paper | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pdfUrl, setPdfUrl] = useState<string>('')

  useEffect(() => {
    async function loadPaper() {
      setLoading(true)
      setError('')

      try {
        // 加载论文
        const paperData = await db.papers.get(paperId)
        if (!paperData) {
          setError('论文不存在')
          setLoading(false)
          return
        }

        console.log('论文数据:', {
          title: paperData.title,
          hasPdfData: !!paperData.pdfData,
          hasLocalPath: !!paperData.localPath,
          localPath: paperData.localPath
        })

        let pdfArrayBuffer: ArrayBuffer

        // 优先从本地文件系统读取
        if (paperData.localPath) {
          try {
            pdfArrayBuffer = await loadPDFFromLocal(paperData.localPath)
          } catch (err) {
            console.error('从本地读取 PDF 失败:', err)
            setError('无法读取本地 PDF 文件: ' + (err as Error).message)
            setLoading(false)
            return
          }
        } 
        // 兼容旧数据：从 DB 读取
        else if (paperData.pdfData) {
          try {
            const binaryString = atob(paperData.pdfData)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            pdfArrayBuffer = bytes.buffer
          } catch (err) {
            console.error('解析 PDF base64 失败:', err)
            setError('PDF 数据格式错误')
            setLoading(false)
            return
          }
        } 
        else {
          setError('PDF 文件不存在')
          setLoading(false)
          return
        }

        // 创建 Blob URL
        const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)

        console.log('PDF Blob URL 创建成功:', url)
        setPdfUrl(url)
        setPaper(paperData)
        setLoading(false)
      } catch (err) {
        console.error('加载PDF失败:', err)
        setError('加载PDF失败: ' + (err as Error).message)
        setLoading(false)
      }
    }

    loadPaper()

    // 清理 Blob URL
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl)
      }
    }
  }, [paperId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-gray-600">加载中...</div>
      </div>
    )
  }

  if (error || !paper) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center p-6">
          <p className="text-red-600 font-medium mb-2">{error || '论文不存在'}</p>
          <p className="text-sm text-gray-500 mb-4">
            提示：此论文可能是在添加 PDF 显示功能之前上传的
          </p>
          <p className="text-xs text-gray-400">
            请重新上传 PDF 文件以使用 PDF 查看功能
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-gray-50">
      {/* PDF 显示区域 - 占满整个空间 */}
      {pdfUrl ? (
        <iframe
          src={`${pdfUrl}#toolbar=0`}
          className="w-full h-full border-0"
          title={paper.title}
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-600">正在加载 PDF...</div>
        </div>
      )}
    </div>
  )
}
