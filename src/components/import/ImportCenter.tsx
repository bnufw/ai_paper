import { useState } from 'react'
import PDFUploader from '../pdf/PDFUploader'
import SearchImportTab from './SearchImportTab'

type ImportTab = 'upload' | 'search'

interface ImportCenterProps {
  onUploadComplete: (paperId: number) => void
  onSearchImportComplete?: (paperId: number) => void
}

export default function ImportCenter({ onUploadComplete, onSearchImportComplete }: ImportCenterProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>('upload')

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">导入论文</h1>
          <p className="text-sm text-gray-500 mt-1">上传本地 PDF，或从已索引的会议论文中搜索导入。</p>
        </div>
        <div className="flex bg-gray-100 border border-gray-200 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'upload'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            本地上传
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'search'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            搜索导入
          </button>
        </div>
      </div>

      <div className={activeTab === 'upload' ? 'block' : 'hidden'}>
        <PDFUploader onUploadComplete={onUploadComplete} />
      </div>
      <div className={activeTab === 'search' ? 'block' : 'hidden'}>
        <SearchImportTab onImportComplete={onSearchImportComplete || onUploadComplete} />
      </div>
    </div>
  )
}
