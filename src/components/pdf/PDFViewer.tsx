import { useEffect, useState } from 'react'
import { db, type Paper } from '../../services/storage/db'
import { loadPDFFromLocal } from '../../services/storage/paperStorage'

interface PDFViewerProps {
  paperId: number
}

export default function PDFViewer({ paperId }: PDFViewerProps) {
  const [paper, setPaper] = useState<Paper | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadPDF() {
      setLoading(true)
      setError(null)

      try {
        const paperData = await db.papers.get(paperId)
        if (!paperData) {
          setError('论文不存在')
          setLoading(false)
          return
        }

        setPaper(paperData)

        // 优先从本地文件读取 PDF
        if (paperData.localPath) {
          const pdfBuffer = await loadPDFFromLocal(paperData.localPath)
          const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
          const url = URL.createObjectURL(blob)
          setPdfUrl(url)
        } else if (paperData.pdfData) {
          // 兼容旧版本：从数据库 base64 读取
          const blob = base64ToBlob(paperData.pdfData)
          const url = URL.createObjectURL(blob)
          setPdfUrl(url)
        } else {
          setError('未找到 PDF 文件')
        }
      } catch (err) {
        console.error('加载 PDF 失败:', err)
        setError('加载 PDF 失败')
      } finally {
        setLoading(false)
      }
    }

    loadPDF()

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
        <div className="text-gray-600">正在加载 PDF...</div>
      </div>
    )
  }

  if (error || !pdfUrl) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-red-600">{error || '无法显示 PDF'}</div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-gray-900">
      <iframe
        src={`${pdfUrl}#toolbar=0`}
        className="w-full h-full border-0"
        title={paper?.title || '论文 PDF'}
      />
    </div>
  )
}

/**
 * 将 base64 字符串转换为 Blob
 */
function base64ToBlob(base64: string): Blob {
  let pureBase64 = base64
  
  if (base64.startsWith('data:')) {
    const match = base64.match(/^data:[^;]+;base64,(.+)$/)
    if (match) {
      pureBase64 = match[1]
    }
  }

  const byteCharacters = atob(pureBase64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: 'application/pdf' })
}
