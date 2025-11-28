import { useState, useRef } from 'react'
import { extractPDFAsImages } from '../../utils/pdfExtractor'
import { convertImagesToMarkdown, renumberImageReferences } from '../../services/pdf/mistralOCR'
import { createPaper } from '../../services/storage/db'

interface PDFUploaderProps {
  onUploadComplete: (paperId: number) => void
}

export default function PDFUploader({ onUploadComplete }: PDFUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, stage: '' })
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
      // 阶段1：提取PDF图片
      setProgress({ current: 0, total: 0, stage: '正在提取PDF页面...' })

      const images = await extractPDFAsImages(file, (current, total) => {
        setProgress({ current, total, stage: `提取页面: ${current}/${total}` })
      })

      // 阶段2：OCR转换
      setProgress({ current: 0, total: images.length, stage: '正在转换为Markdown...' })

      let markdown = await convertImagesToMarkdown(images, (current, total) => {
        setProgress({ current, total, stage: `转换中: ${current}/${total}页` })
      })

      // 重新编号图片引用
      markdown = renumberImageReferences(markdown)

      // 阶段3：保存到数据库
      setProgress({ current: 0, total: 0, stage: '正在保存...' })

      const title = file.name.replace('.pdf', '')
      const paperId = await createPaper(title, markdown, images)

      // 完成
      setProgress({ current: 0, total: 0, stage: '完成！' })
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
              {progress.total > 0 && (
                <span className="text-sm text-gray-600">
                  {Math.round((progress.current / progress.total) * 100)}%
                </span>
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: progress.total > 0
                    ? `${(progress.current / progress.total) * 100}%`
                    : '0%'
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
            <strong>💡 提示：</strong>
            <br />
            • 处理时间取决于PDF页数，通常每10页需要30-60秒
            <br />
            • 请确保已在设置中配置Mistral API Key
            <br />
            • 转换过程中请不要关闭页面
          </p>
        </div>
      </div>
    </div>
  )
}
