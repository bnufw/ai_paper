import { useState, useEffect } from 'react'
import Sidebar from './components/layout/Sidebar'
import ResizablePanel from './components/layout/ResizablePanel'
import APIKeySettings from './components/settings/APIKeySettings'
import StorageSetupDialog from './components/settings/StorageSetupDialog'
import PDFUploader from './components/pdf/PDFUploader'
import ChatPanel from './components/chat/ChatPanel'
import NotePanel from './components/note/NotePanel'
import PDFViewer from './components/pdf/PDFViewer'
import { IdeaViewer, IdeaChatPanel } from './components/idea'
import { useIdeaChat } from './hooks/useIdeaChat'
import { getDirectoryHandle, checkDirectoryPermission } from './services/storage/fileSystem'
import { db, type IdeaSession } from './services/storage/db'
import { organizeNote, loadNote, generateNote, saveNote } from './services/note/noteService'

function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [showStorageSetup, setShowStorageSetup] = useState(false)
  const [currentPaperId, setCurrentPaperId] = useState<number | null>(null)
  const [currentIdeaSession, setCurrentIdeaSession] = useState<IdeaSession | null>(null)
  const [showUploader, setShowUploader] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'paper' | 'note'>('paper')
  const [noteMode, setNoteMode] = useState<'edit' | 'preview'>('edit')
  const [currentPaperLocalPath, setCurrentPaperLocalPath] = useState<string | undefined>(undefined)
  const [noteVersion, setNoteVersion] = useState(0)
  const [isOrganizing, setIsOrganizing] = useState(false)
  const [isGeneratingNote, setIsGeneratingNote] = useState(false)

  // Idea 对话 Hook
  const ideaChat = useIdeaChat(currentIdeaSession)

  const handleNoteUpdated = () => {
    setNoteVersion(v => v + 1)
  }

  const handleOrganizeNote = async () => {
    if (!currentPaperLocalPath || isOrganizing) return
    
    setIsOrganizing(true)
    try {
      const currentContent = await loadNote(currentPaperLocalPath)
      if (!currentContent) {
        alert('笔记内容为空，无法整理')
        return
      }
      await organizeNote(currentPaperLocalPath, currentContent)
      setNoteVersion(v => v + 1)
    } catch (err) {
      alert(err instanceof Error ? err.message : '整理笔记失败')
    } finally {
      setIsOrganizing(false)
    }
  }

  const handleGenerateNote = async () => {
    if (!currentPaperLocalPath || isGeneratingNote) return
    
    setIsGeneratingNote(true)
    try {
      const content = await generateNote(currentPaperLocalPath)
      await saveNote(currentPaperLocalPath, content)
      setNoteVersion(v => v + 1)
    } catch (err) {
      alert(err instanceof Error ? err.message : '生成笔记失败')
    } finally {
      setIsGeneratingNote(false)
    }
  }

  // 检查是否需要显示首次引导
  useEffect(() => {
    async function checkStorageSetup() {
      try {
        const handle = await getDirectoryHandle()
        if (!handle) {
          setShowStorageSetup(true)
          return
        }
        
        // 验证目录权限是否仍然有效
        const hasPermission = await checkDirectoryPermission(handle)
        if (!hasPermission) {
          console.warn('目录访问权限已失效,需要重新授权')
          setShowStorageSetup(true)
        }
      } catch (error) {
        console.error('检查存储设置失败:', error)
        setShowStorageSetup(true)
      }
    }
    checkStorageSetup()
  }, [])

  const handlePaperSelect = async (paperId: number) => {
    setCurrentPaperId(paperId)
    setCurrentIdeaSession(null) // 切换到论文时清空 Idea 会话
    setShowUploader(false)
    setActiveTab('paper')

    const paper = await db.papers.get(paperId)
    setCurrentPaperLocalPath(paper?.localPath)
  }

  const handleSelectIdeaSession = (session: IdeaSession) => {
    setCurrentIdeaSession(session)
    setCurrentPaperId(null) // 切换到 Idea 时清空论文选择
    setShowUploader(false)
  }

  const handleNewPaper = () => {
    setCurrentPaperId(null)
    setCurrentIdeaSession(null)
    setShowUploader(true)
  }

  const handleUploadComplete = (paperId: number) => {
    setCurrentPaperId(paperId)
    setShowUploader(false)
  }

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Sidebar */}
      <Sidebar
        currentPaperId={currentPaperId}
        currentIdeaSessionId={currentIdeaSession?.id ?? null}
        onSelectPaper={handlePaperSelect}
        onSelectIdeaSession={handleSelectIdeaSession}
        onNewPaper={handleNewPaper}
        onOpenSettings={() => setShowSettings(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">

        {/* Center Area */}
        <div className="flex-1 flex">
          {showUploader ? (
            /* Upload View */
            <div className="flex-1 overflow-auto p-8">
              <PDFUploader onUploadComplete={handleUploadComplete} />
            </div>
          ) : currentIdeaSession ? (
            /* Idea Chat View: Idea 查看器 + 对话面板 */
            <ResizablePanel
              leftPanel={
                <IdeaViewer
                  currentIdeaSlug={ideaChat.currentIdeaSlug}
                  bestIdea={ideaChat.bestIdea}
                  allIdeas={ideaChat.allIdeas}
                  onIdeaChange={ideaChat.setCurrentIdeaSlug}
                />
              }
              rightPanel={
                <IdeaChatPanel
                  session={currentIdeaSession}
                  messages={ideaChat.messages}
                  conversations={ideaChat.conversations}
                  currentConversationId={ideaChat.currentConversationId}
                  loading={ideaChat.loading}
                  error={ideaChat.error}
                  streamingText={ideaChat.streamingText}
                  streamingThought={ideaChat.streamingThought}
                  streamingStartTime={ideaChat.streamingStartTime}
                  editingMessageId={ideaChat.editingMessageId}
                  branches={ideaChat.branches}
                  activeBranchId={ideaChat.activeBranchId}
                  lastClearAt={ideaChat.lastClearAt}
                  backgroundTaskCount={ideaChat.backgroundTaskCount}
                  onSendMessage={ideaChat.sendMessage}
                  onClearMessages={ideaChat.clearMessages}
                  onClearContext={ideaChat.clearContext}
                  onBack={handleNewPaper}
                  onClearError={ideaChat.clearError}
                  onNewConversation={ideaChat.createNewConversation}
                  onSwitchConversation={ideaChat.switchConversation}
                  onDeleteConversation={ideaChat.deleteConversation}
                  onRenameConversation={ideaChat.renameConversation}
                  onEditMessage={ideaChat.editMessage}
                  onCancelEdit={ideaChat.cancelEdit}
                  onRegenerateResponse={ideaChat.regenerateResponse}
                  onCreateBranch={ideaChat.createBranchFromMessage}
                  onSwitchBranch={ideaChat.switchToBranch}
                />
              }
              defaultLeftWidth={50}
              minLeftWidth={30}
              minRightWidth={30}
            />
          ) : currentPaperId ? (
            /* Paper View: 论文/笔记标签页 + 聊天面板 */
            <ResizablePanel
              leftPanel={
                <div className="relative h-full">
                  {/* 顶部热区 - 只有鼠标悬停在顶部区域才触发显示工具栏 */}
                  <div className="absolute top-0 left-0 right-0 h-12 z-20 group/tabs">
                    {/* 标签页切换工具栏 */}
                    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between bg-white/95 backdrop-blur-sm px-2 py-1 opacity-0 group-hover/tabs:opacity-100 transition-opacity duration-200 shadow-sm">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setActiveTab('paper')}
                        className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                          activeTab === 'paper'
                            ? 'bg-blue-100 text-blue-600'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        📄 论文
                      </button>
                      <button
                        onClick={() => setActiveTab('note')}
                        className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                          activeTab === 'note'
                            ? 'bg-blue-100 text-blue-600'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        📝 笔记
                      </button>
                    </div>
                    {/* 笔记模式切换 - 仅在笔记标签激活时显示 */}
                    {activeTab === 'note' && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => setNoteMode('edit')}
                          className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                            noteMode === 'edit'
                              ? 'bg-green-100 text-green-600'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          ✏️ 编辑
                        </button>
                        <button
                          onClick={() => setNoteMode('preview')}
                          className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                            noteMode === 'preview'
                              ? 'bg-green-100 text-green-600'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          👁️ 预览
                        </button>
                        <button
                          onClick={handleOrganizeNote}
                          disabled={isOrganizing}
                          className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                            isOrganizing
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'text-gray-600 hover:bg-purple-100 hover:text-purple-600'
                          }`}
                        >
                          {isOrganizing ? '⏳ 整理中...' : '✨ AI整理'}
                        </button>
                        <button
                          onClick={handleGenerateNote}
                          disabled={isGeneratingNote}
                          className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                            isGeneratingNote
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'text-gray-600 hover:bg-blue-100 hover:text-blue-600'
                          }`}
                        >
                          {isGeneratingNote ? '⏳ 生成中...' : '🤖 AI生成'}
                        </button>
                      </div>
                    )}
                    </div>
                  </div>
                  {/* 内容区域 */}
                  <div className="h-full">
                    {activeTab === 'paper' ? (
                      <PDFViewer paperId={currentPaperId} />
                    ) : (
                      <NotePanel paperId={currentPaperId} localPath={currentPaperLocalPath} mode={noteMode} noteVersion={noteVersion} />
                    )}
                  </div>
                </div>
              }
              rightPanel={<ChatPanel paperId={currentPaperId} localPath={currentPaperLocalPath} onNoteUpdated={handleNoteUpdated} />}
              defaultLeftWidth={50}
              minLeftWidth={30}
              minRightWidth={30}
            />
          ) : (
            /* Welcome Screen */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-700 mb-4">
                  欢迎使用学术论文阅读器
                </h2>
                <p className="text-gray-600 mb-6">
                  从左侧选择一篇论文开始阅读,或上传新的PDF
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

      {/* Storage Setup Dialog */}
      {showStorageSetup && (
        <StorageSetupDialog onComplete={() => setShowStorageSetup(false)} />
      )}
    </div>
  )
}

export default App
