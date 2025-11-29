import { useState, useRef } from 'react'
import { convertPDFToMarkdown, renumberImageReferences } from '../../services/pdf/mistralOCR'
import { createPaper } from '../../services/storage/db'

interface PDFUploaderProps {
  onUploadComplete: (paperId: number) => void
}

export default function PDFUploader({ onUploadComplete }: PDFUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState({ stage: '', percent: 0 })
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    // 检查文件类型
    if (!selectedFile.type.includes('pdf')) {
      setError('请选择PDF文件')
      return
    }

    // 检查文件大小（限制50MB）
    const maxSize = 50 * 1024 * 1024
    if (selectedFile.size > maxSize) {
      setError('PDF文件大小不能超过50MB')
      return
    }

    setFile(selectedFile)
    setError('')
  }

  const handleUpload = async () => {
    if (!file) return

    setProcessing(true)
    setError('')

    try {
      // 将 PDF 文件转为 base64
      setProgress({ stage: '正在读取PDF...', percent: 5 })
      const pdfData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // 使用新的 Mistral OCR API 直接处理 PDF
      const { markdown: rawMarkdown, images } = await convertPDFToMarkdown(
        file,
        (stage, percent) => {
          setProgress({ stage, percent: percent || 0 })
        }
      )

      // 重新编号图片引用
      const markdown = renumberImageReferences(rawMarkdown)

      // 保存到数据库
      setProgress({ stage: '正在保存...', percent: 95 })

      const title = file.name.replace('.pdf', '')
      const paperId = await createPaper(title, markdown, images, pdfData)

      // 完成
      setProgress({ stage: '完成!', percent: 100 })
      setTimeout(() => {
        onUploadComplete(paperId)
      }, 500)

    } catch (err) {
      console.error('PDF处理失败:', err)
      setError((err as Error).message)
      setProcessing(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          上传论文PDF
        </h2>

        {/* 文件选择 */}
        <div className="mb-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
          >
            {file ? (
              <div>
                <p className="text-lg font-medium text-gray-700">{file.name}</p>
                <p className="text-sm text-gray-500 mt-2">
                  大小: {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-lg text-gray-600">点击选择PDF文件</p>
                <p className="text-sm text-gray-400 mt-2">或拖拽文件到此处</p>
                <p className="text-xs text-gray-400 mt-1">限制: 50MB以内</p>
              </div>
            )}
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800 whitespace-pre-line">{error}</p>
          </div>
        )}

        {/* 处理进度 */}
        {processing && (
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-gray-600">{progress.stage}</span>
              <span className="text-sm text-gray-600">
                {Math.round(progress.percent)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${progress.percent}%`
                }}
              />
            </div>
          </div>
        )}

        {/* 上传按钮 */}
        <button
          onClick={handleUpload}
          disabled={!file || processing}
          className="w-full py-3 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {processing ? '处理中...' : '开始处理'}
        </button>

        {/* 提示信息 */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-800">
            <strong>💡 提示:</strong>
            <br />
            • 使用 Mistral 专用 OCR API,处理速度更快,识别质量更好
            <br />
            • 请确保已在设置中配置 Mistral API Key
            <br />
            • 转换过程中请不要关闭页面
          </p>
        </div>
      </div>
    </div>
  )
}
