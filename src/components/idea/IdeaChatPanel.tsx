import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import ThinkingTimer from '../chat/ThinkingTimer'
import ImageUploadButton from '../chat/ImageUploadButton'
import ImagePreview from '../chat/ImagePreview'
import ImageViewer from '../chat/ImageViewer'
import IdeaPaperMentionPopup, { type IdeaPaperMentionPopupRef } from './IdeaPaperMentionPopup'
import IdeaConversationList from './IdeaConversationList'
import IdeaMessageBubble from './IdeaMessageBubble'
import type { IdeaSession } from '../../types/idea'
import type { IdeaMessage, IdeaConversation, Paper, MessageImage, BranchInfo } from '../../services/storage/db'
import { exportIdeaChatToFile } from '../../services/idea/workflowStorage'

import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

interface IdeaChatPanelProps {
  session: IdeaSession | null
  messages: IdeaMessage[]
  conversations: IdeaConversation[]
  currentConversationId: number | null
  loading: boolean
  error: string
  streamingText: string
  streamingThought: string
  streamingStartTime: Date | null
  editingMessageId: number | null
  branches: BranchInfo[]
  activeBranchId: number
  lastClearAt: Date | null
  backgroundTaskCount: number
  onSendMessage: (content: string, images?: MessageImage[], editingId?: number) => void
  onClearMessages: () => void
  onClearContext: () => void
  onBack: () => void
  onClearError?: () => void
  onNewConversation: () => void
  onSwitchConversation: (id: number) => void
  onDeleteConversation: (id: number) => void
  onRenameConversation: (id: number, newTitle: string) => void
  onEditMessage: (messageId: number) => void
  onCancelEdit: () => void
  onRegenerateResponse: (messageId: number) => void
  onCreateBranch: (messageId: number) => void
  onSwitchBranch: (branchId: number) => void
}

export default function IdeaChatPanel({
  session,
  messages,
  conversations,
  currentConversationId,
  loading,
  error,
  streamingText,
  streamingThought,
  streamingStartTime,
  editingMessageId,
  branches,
  activeBranchId,
  lastClearAt,
  backgroundTaskCount,
  onSendMessage,
  onClearMessages,
  onClearContext,
  onBack,
  onClearError,
  onNewConversation,
  onSwitchConversation,
  onDeleteConversation,
  onRenameConversation,
  onEditMessage,
  onCancelEdit,
  onRegenerateResponse,
  onCreateBranch,
  onSwitchBranch
}: IdeaChatPanelProps) {

  const [inputValue, setInputValue] = useState('')
  const [pendingImages, setPendingImages] = useState<MessageImage[]>([])
  const [exporting, setExporting] = useState(false)
  const [mentionPopup, setMentionPopup] = useState<{
    show: boolean
    searchText: string
    position: { top: number; left: number }
  } | null>(null)
  const [slashCommand, setSlashCommand] = useState<{
    show: boolean
    position: { top: number; left: number }
  } | null>(null)
  const [viewerImages, setViewerImages] = useState<MessageImage[] | null>(null)
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0)
  const [showBranchSelector, setShowBranchSelector] = useState(false)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionPopupRef = useRef<IdeaPaperMentionPopupRef>(null)

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages, streamingText])

  const handleExport = async () => {
    if (!session?.localPath || !currentConversationId || messages.length === 0) return

    setExporting(true)
    try {
      await exportIdeaChatToFile(currentConversationId, session.localPath)
      alert('对话已导出到会话目录')
    } catch (err: any) {
      alert(`导出失败: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  const handleSend = async () => {
    if ((!inputValue.trim() && pendingImages.length === 0) || loading) return
    const message = inputValue
    const images = pendingImages.length > 0 ? pendingImages : undefined
    setInputValue('')
    setPendingImages([])
    onSendMessage(message, images, editingMessageId || undefined)
  }

  const handleEditMessage = (messageId: number) => {
    const msg = messages.find(m => m.id === messageId)
    if (msg) {
      setInputValue(msg.content)
      setPendingImages(msg.images || [])
      onEditMessage(messageId)
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }

  const handleCancelEdit = () => {
    onCancelEdit()
    setInputValue('')
    setPendingImages([])
  }

  const handleImagesSelected = (images: MessageImage[]) => {
    setPendingImages(prev => [...prev, ...images])
  }

  const handleRemoveImage = (index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleImageClick = (images: MessageImage[], index: number) => {
    setViewerImages(images)
    setViewerInitialIndex(index)
  }

  const handleCloseViewer = () => {
    setViewerImages(null)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInputValue(value)

    const cursorPos = e.target.selectionStart
    const textBeforeCursor = value.substring(0, cursorPos)

    // 检测斜杠命令触发
    if (textBeforeCursor === '/' && textareaRef.current) {
      const rect = textareaRef.current.getBoundingClientRect()
      setSlashCommand({
        show: true,
        position: { top: rect.top, left: rect.left }
      })
      setMentionPopup(null)
      return
    } else {
      setSlashCommand(null)
    }

    // 检测@符号触发
    const match = textBeforeCursor.match(/@(\S*)$/)
    if (match && textareaRef.current && session) {
      const rect = textareaRef.current.getBoundingClientRect()
      setMentionPopup({
        show: true,
        searchText: match[1],
        position: {
          top: rect.top,
          left: rect.left
        }
      })
    } else {
      setMentionPopup(null)
    }
  }

  const handleSlashCommand = (command: string) => {
    setSlashCommand(null)
    setInputValue('')
    if (command === 'clear') {
      onClearContext()
    }
  }

  const handlePaperSelect = (paper: Paper) => {
    if (!textareaRef.current) return

    const cursorPos = textareaRef.current.selectionStart
    const textBeforeCursor = inputValue.substring(0, cursorPos)
    const textAfterCursor = inputValue.substring(cursorPos)

    const atMatch = textBeforeCursor.match(/@(\S*)$/)
    if (!atMatch) return

    const atPos = cursorPos - atMatch[0].length
    const mention = `@[${paper.title}](paperId:${paper.id})`

    const newValue = inputValue.substring(0, atPos) + mention + textAfterCursor
    setInputValue(newValue)
    setMentionPopup(null)

    setTimeout(() => {
      textareaRef.current?.focus()
      const newCursorPos = atPos + mention.length
      textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 斜杠命令选择
    if (slashCommand) {
      if (e.key === 'Escape') {
        setSlashCommand(null)
        setInputValue('')
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSlashCommand('clear')
        return
      }
    }

    if (mentionPopup && mentionPopupRef.current) {
      const handled = mentionPopupRef.current.handleKeyDown(e)
      if (handled) return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'))
    if (imageItems.length === 0) return

    e.preventDefault()

    for (const item of imageItems) {
      const blob = item.getAsFile()
      if (!blob) continue

      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setPendingImages(prev => [...prev, {
          data: base64,
          mimeType: blob.type
        }])
      }
      reader.readAsDataURL(blob)
    }
  }

  const handleCreateBranch = async (messageId: number) => {
    onCreateBranch(messageId)
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 顶部栏 */}
      <div className="flex-shrink-0 bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            title="返回论文列表"
          >
            ← 返回
          </button>
          <div className="h-4 w-px bg-gray-300" />
          <span className="text-sm font-medium text-gray-700">
            {session?.groupName} - Idea 对话
          </span>
          {backgroundTaskCount > 0 && (
            <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
              {backgroundTaskCount} 个后台任务
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 分支选择器 */}
          {branches.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowBranchSelector(!showBranchSelector)}
                className="text-xs text-gray-500 hover:text-blue-600 transition-colors px-2 py-1 rounded border border-gray-200 hover:border-blue-300"
              >
                🔀 分支 {activeBranchId === 0 ? '主' : activeBranchId}
              </button>
              {showBranchSelector && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px] z-50">
                  {branches.map(branch => (
                    <button
                      key={branch.branchId}
                      onClick={() => {
                        onSwitchBranch(branch.branchId)
                        setShowBranchSelector(false)
                      }}
                      className={`w-full px-3 py-1.5 text-left text-sm hover:bg-blue-50 ${
                        branch.branchId === activeBranchId ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      {branch.branchId === 0 ? '主分支' : `分支 ${branch.branchId}`}
                      <span className="text-xs text-gray-400 ml-1">({branch.messageCount})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || messages.length === 0}
            className="text-xs text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="导出对话到会话目录"
          >
            {exporting ? '导出中...' : '📤 导出'}
          </button>
          <span className="text-xs text-gray-400 bg-yellow-50 px-2 py-1 rounded">
            Gemini
          </span>
        </div>
      </div>

      {/* 对话会话列表 */}
      <IdeaConversationList
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelect={onSwitchConversation}
        onDelete={onDeleteConversation}
        onRename={onRenameConversation}
        onClear={onClearMessages}
        onClearContext={onClearContext}
        onNewConversation={onNewConversation}
      />

      {/* 消息区域 */}
      <div className="flex-1 flex flex-col min-h-0">
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-lg mb-2">💡 开始讨论</p>
              <p className="text-sm">向 AI 提问关于这个研究想法的任何问题</p>
              <p className="text-xs mt-2 text-gray-400">输入 / 查看命令，@ 引用论文</p>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => {
                // 检查是否需要显示清空分割线
                const showClearDivider = lastClearAt &&
                  index > 0 &&
                  messages[index - 1].timestamp <= lastClearAt &&
                  msg.timestamp > lastClearAt

                return (
                  <div key={msg.id || msg.timestamp.getTime()}>
                    {showClearDivider && (
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-orange-300"></div>
                        <span className="text-xs text-orange-500 font-medium px-2">上下文已清除</span>
                        <div className="flex-1 h-px bg-orange-300"></div>
                      </div>
                    )}
                    <IdeaMessageBubble
                      message={msg}
                      isLoading={loading}
                      onEdit={handleEditMessage}
                      onRegenerate={onRegenerateResponse}
                      onCreateBranch={handleCreateBranch}
                      onImageClick={handleImageClick}
                    />
                  </div>
                )
              })}

              {/* 尾部分割线：清空后尚无新消息时显示 */}
              {lastClearAt && messages.length > 0 && !messages.some(m => m.timestamp > lastClearAt) && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-orange-300"></div>
                  <span className="text-xs text-orange-500 font-medium px-2">上下文已清除</span>
                  <div className="flex-1 h-px bg-orange-300"></div>
                </div>
              )}
            </>
          )}

          {/* 流式输出 */}
          {(streamingThought || streamingText || (loading && streamingStartTime)) && (
            <div className="flex justify-start">
              <div className="max-w-[95%] bg-white text-gray-800 border border-gray-200 rounded-lg p-3 overflow-hidden">
                {(streamingThought || (loading && streamingStartTime && !streamingText)) && (
                  <details className="mb-3 rounded-lg bg-blue-50/50 overflow-hidden border border-blue-100">
                    <summary className="list-none flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100">
                          <svg className="w-5 h-5 text-blue-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </div>
                        <span className="text-sm font-semibold text-blue-800">
                          {streamingStartTime ? <ThinkingTimer startTime={streamingStartTime} /> : '思考中...'}
                        </span>
                      </div>
                    </summary>
                    <div className="px-3 pb-3 pt-2 border-t border-blue-100 text-xs">
                      <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                        {streamingThought || '正在思考...'}
                      </div>
                    </div>
                  </details>
                )}

                {streamingText && (
                  <div className="prose prose-sm max-w-none overflow-hidden">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex, rehypeHighlight]}
                    >
                      {streamingText}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )}

          {loading && !streamingText && !streamingThought && !streamingStartTime && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-md flex items-start justify-between">
            <p className="text-sm text-red-800 flex-1">{error}</p>
            {onClearError && (
              <button
                onClick={onClearError}
                className="ml-2 text-red-600 hover:text-red-800 transition-colors flex-shrink-0"
                title="关闭"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* 输入框 */}
        <div className="flex-shrink-0 bg-white border-t p-4 relative">
          <div className="flex flex-col gap-2">
            {/* 编辑提示 */}
            {editingMessageId && (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-blue-800">
                  <span>✏️</span>
                  <span>编辑消息中 - 发送后将重新生成回复</span>
                </div>
                <button
                  onClick={handleCancelEdit}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  取消
                </button>
              </div>
            )}

            {/* 图片预览 */}
            <ImagePreview images={pendingImages} onRemove={handleRemoveImage} />

            <div className="flex gap-2 items-end">
              {/* 图片上传按钮 */}
              <ImageUploadButton
                onImagesSelected={handleImagesSelected}
                disabled={loading}
                maxCount={4}
              />

              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="讨论这个研究想法，输入 @ 引用论文，/ 查看命令... (Shift+Enter换行)"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-900"
                rows={3}
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={(!inputValue.trim() && pendingImages.length === 0) || loading}
                className="px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {loading ? '...' : '发送'}
              </button>
            </div>
          </div>

          {/* 斜杠命令弹窗 */}
          {slashCommand && (
            <div
              className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]"
              style={{
                bottom: `calc(100% + 8px)`,
                left: '1rem'
              }}
            >
              <button
                onClick={() => handleSlashCommand('clear')}
                className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-2 text-sm"
              >
                <span className="text-orange-500">🧹</span>
                <div>
                  <div className="font-medium text-gray-800">/clear</div>
                  <div className="text-xs text-gray-500">清空对话上下文</div>
                </div>
              </button>
            </div>
          )}

          {mentionPopup && session && (
            <IdeaPaperMentionPopup
              ref={mentionPopupRef}
              searchText={mentionPopup.searchText}
              groupId={session.groupId}
              onSelect={handlePaperSelect}
              onClose={() => setMentionPopup(null)}
              position={mentionPopup.position}
            />
          )}
        </div>
      </div>

      {/* 图片查看器 */}
      {viewerImages && (
        <ImageViewer
          images={viewerImages}
          initialIndex={viewerInitialIndex}
          onClose={handleCloseViewer}
        />
      )}
    </div>
  )
}
