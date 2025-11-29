import { useState } from 'react'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import APIKeySettings from './components/settings/APIKeySettings'
import PDFUploader from './components/pdf/PDFUploader'
import PDFViewer from './components/pdf/PDFViewer'
import ChatPanel from './components/chat/ChatPanel'

function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [currentPaperId, setCurrentPaperId] = useState<number | null>(null)
  const [showUploader, setShowUploader] = useState(true)

  const handlePaperSelect = (paperId: number) => {
    setCurrentPaperId(paperId)
    setShowUploader(false)
  }

  const handleNewPaper = () => {
    setCurrentPaperId(null)
    setShowUploader(true)
  }

  const handleUploadComplete = (paperId: number) => {
    setCurrentPaperId(paperId)
    setShowUploader(false)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <Header onOpenSettings={() => setShowSettings(true)} />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          currentPaperId={currentPaperId}
          onSelectPaper={handlePaperSelect}
          onNewPaper={handleNewPaper}
        />

        {/* Center Area */}
        <div className="flex-1 flex">
          {showUploader ? (
            /* Upload View */
            <div className="flex-1 overflow-auto p-8">
              <PDFUploader onUploadComplete={handleUploadComplete} />
            </div>
          ) : currentPaperId ? (
            /* Paper View: Split between PDF and Chat */
            <>
              {/* Left: PDF Viewer */}
              <div className="w-1/2 border-r">
                <PDFViewer paperId={currentPaperId} />
              </div>

              {/* Right: Chat Panel */}
              <div className="w-1/2">
                <ChatPanel paperId={currentPaperId} />
              </div>
            </>
          ) : (
            /* Welcome Screen */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-700 mb-4">
                  欢迎使用学术论文阅读器
                </h2>
                <p className="text-gray-600 mb-6">
                  从左侧选择一篇论文开始阅读，或上传新的PDF
                </p>
                <button
                  onClick={handleNewPaper}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  上传论文
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <APIKeySettings onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

export default App
