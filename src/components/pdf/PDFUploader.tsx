import { useState, useRef, useEffect } from 'react'
import { getAllGroups, type PaperGroup } from '../../services/storage/db'
import { processAndSavePaper } from '../../services/paper/importPaper'

interface PDFUploaderProps {
  onUploadComplete: (paperId: number) => void
}

export default function PDFUploader({ onUploadComplete }: PDFUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState({ stage: '', percent: 0 })
  const [error, setError] = useState('')
  const [groups, setGroups] = useState<PaperGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 加载分组列表
  useEffect(() => {
    loadGroups()
  }, [])

  const loadGroups = async () => {
    try {
      const allGroups = await getAllGroups()
      setGroups(allGroups)
    } catch (err) {
      console.error('加载分组失败:', err)
    }
  }

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
      const paperId = await processAndSavePaper(file, {
        groupId: selectedGroupId,
        onProgress: (stage, percent) => setProgress({ stage, percent })
      })

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

        {/* 分组选择 */}
        {file && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择分组
            </label>
            <select
              value={selectedGroupId || ''}
              onChange={(e) => setSelectedGroupId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">未分类</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        )}

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
