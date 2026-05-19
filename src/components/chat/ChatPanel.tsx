import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import { useChat } from '../../hooks/useChat'
import { getGeminiSettings, type MessageImage, type Paper, markMessageAddedToNote } from '../../services/storage/db'
import { appendToNote } from '../../services/note/noteService'
import { loadGroupNote, saveGroupNote } from '../../services/storage/fileSystem'
import ConversationList from './ConversationList'
import ThinkingTimer from './ThinkingTimer'
import ImageUploadButton from './ImageUploadButton'
import ImagePreview from './ImagePreview'
import ImageViewer from './ImageViewer'
import PaperMentionPopup, { type PaperMentionPopupRef } from './PaperMentionPopup'
import MessageContent from './MessageContent'

// 导入样式
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

const SUMMARIZE_PROMPT = `你是 =第一性原理思考者=，擅长从万物基本原理和常识出发，推演做事思路。请你仔细阅读并分析这篇文章，就以下 6 点进行有条理的列举与讲解，**省略所有客套话**，并用 markdown 形式给出（不要引入任何形式的 latex，公式用文本形式给出）：

1. **Task：** 这篇文章解决的是什么问题？请尽可能形式化！
2. **Challenge：** 传统的方法在解决这个问题时遇到了什么挑战？
3. **Insight & Novelty：**
    1. 作者的 Insight 是被什么 Inspiration 启发的？
    2. 作者的 Insight 究竟是什么？是在什么方面上的 Insight？对于每个 Insight，是哪些上述的 Inspiration 启发的？
    3. Novelty：作者本篇文章的 Novelty 体现在何处？是否有架构上、方法上还是策略上的，支持自己 Insight 的创新？
    4. 对于每一个 Novelty，请你清晰的严格按这个格式描述：【创新点解决的问题是什么】->【受哪个 insight 启发】->【设计了什么创新点，尽可能具体描述】
4. **Potential flaw：**
    1. 当前问题的情境是否有局限？有没有可能通过延伸架构，解决一些新情境（例如：维度更多、条件更多、约束更多）下的问题？
    2. 在目前情境下，若数据有什么样的不好的性质，解决可能会遇到特别的困难？
    3. 在以上这些困难中，哪种困难值得深度挖掘写成 paper?
5. **Motivation：**
    1. 请你总结这篇文章想到 general idea 的方式，最好以问句形式给出（如：之前的方法...，那可不可以尝试一下 xxx），遵循第一性原理，从问题的本质出发，找到最合理、最容易的，想到本篇文章 idea 的方式。`

const SLASH_COMMANDS = [
  {
    command: 'clear',
    label: '/clear',
    description: '清空对话上下文',
    icon: '🧹',
    iconClassName: 'text-orange-500'
  },
  {
    command: 'summarize',
    label: '/summarize',
    description: '插入论文总结提示词',
    icon: '📝',
    iconClassName: 'text-blue-500'
  }
] as const

interface ChatPanelProps {
  paperId: number | null
  groupId?: number | null
  groupName?: string | null
  localPath: string | undefined
  onNoteUpdated?: () => void
}

export default function ChatPanel({ paperId, groupId = null, groupName = null, localPath, onNoteUpdated }: ChatPanelProps) {
  const {
    messages,
    conversations,
    currentConversationId,
    lastClearAt,
    loading,
    error,
    streamingText,
    streamingThought,
    streamingStartTime,
    editingMessageId,
    sendMessage,
    editMessage,
    cancelEdit,
    createNewConversation,
    setCurrentConversationId,
    deleteConversation,
    renameConversation,
    exportConversation,
    clearMessages,
    markAsAddedToNote
  } = useChat({ paperId, groupId, groupName })

  const [inputValue, setInputValue] = useState('')
  const [pendingImages, setPendingImages] = useState<MessageImage[]>([])
  const [viewerImages, setViewerImages] = useState<MessageImage[] | null>(null)
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0)
  const [mentionPopup, setMentionPopup] = useState<{
    show: boolean
    searchText: string
    position: { top: number; left: number }
  } | null>(null)
  const [modelName, setModelName] = useState('Gemini')
  const [addingToNoteId, setAddingToNoteId] = useState<number | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null)
  const [slashCommand, setSlashCommand] = useState<{
    show: boolean
    searchText: string
    position: { top: number; left: number }
  } | null>(null)
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionPopupRef = useRef<PaperMentionPopupRef>(null)

  const filteredSlashCommands = slashCommand
    ? SLASH_COMMANDS.filter(item => item.command.startsWith(slashCommand.searchText.toLowerCase()))
    : []
  const canAddToNote = paperId != null ? !!localPath : !!groupName
  const emptyDescription = paperId != null
    ? '向 AI 提问关于这篇论文的任何问题'
    : '向 AI 提问关于该分组下所有论文的任何问题'

  // 加载模型配置
  useEffect(() => {
    async function loadModelName() {
      const settings = await getGeminiSettings()
      const displayName = settings.model === 'gemini-2.5-pro'
        ? '2.5 Pro'
        : settings.model === 'gemini-3.1-pro-preview'
          ? '3.1 Pro'
          : settings.model === 'gemini-3-pro-preview'
            ? '3 Pro'
            : settings.model
      setModelName(displayName)
    }
    loadModelName()

    // 监听设置变更事件
    const handleSettingsChange = () => {
      loadModelName()
    }
    window.addEventListener('gemini-settings-changed', handleSettingsChange)
    return () => {
      window.removeEventListener('gemini-settings-changed', handleSettingsChange)
    }
  }, [])

  // 自动滚动到最新消息
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages, streamingText])

  const handleSend = async () => {
    if ((!inputValue.trim() && pendingImages.length === 0) || loading) return

    const message = inputValue
    const images = pendingImages
    setInputValue('')
    setPendingImages([])
    
    // 如果是编辑模式,传入编辑的消息ID
    await sendMessage(message, images, editingMessageId || undefined)
  }

  const handleEditMessage = (messageId: number) => {
    const editData = editMessage(messageId)
    if (editData) {
      setInputValue(editData.content)
      setPendingImages(editData.images)
      // 聚焦输入框
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }

  const handleCancelEdit = () => {
    cancelEdit()
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

  const handleAddToNote = async (messageId: number, content: string) => {
    if (!canAddToNote || addingToNoteId) return
    setAddingToNoteId(messageId)
    try {
      if (paperId != null && localPath) {
        await appendToNote(localPath, content)
      } else if (groupName) {
        const currentNote = await loadGroupNote(groupName)
        const addedAt = new Date().toLocaleString('zh-CN')
        const block = `## 从分组对话添加 (${addedAt})\n\n${content}`
        await saveGroupNote(groupName, currentNote?.trim() ? `${currentNote}\n\n---\n\n${block}` : `# 分组笔记\n\n${block}`)
      }
      await markMessageAddedToNote(messageId)
      markAsAddedToNote(messageId)
      onNoteUpdated?.()
    } catch (err) {
      console.error('添加到笔记失败:', err)
    } finally {
      setAddingToNoteId(null)
    }
  }

  const handleCopyMessage = async (messageId: number, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInputValue(value)

    const cursorPos = e.target.selectionStart
    const textBeforeCursor = value.substring(0, cursorPos)

    // 检测斜杠命令触发（仅在行首输入 / 时）
    const slashMatch = textBeforeCursor.match(/^\/(\w*)$/)
    if (slashMatch && textareaRef.current) {
      const rect = textareaRef.current.getBoundingClientRect()
      setSlashCommand({
        show: true,
        searchText: slashMatch[1],
        position: { top: rect.top, left: rect.left }
      })
      setSlashSelectedIndex(0)
      setMentionPopup(null)
      return
    } else {
      setSlashCommand(null)
      setSlashSelectedIndex(0)
    }

    // 检测@符号触发
    const match = textBeforeCursor.match(/@(\S*)$/)

    if (match && textareaRef.current) {
      // 计算弹窗位置 - 使用视口坐标（配合 fixed 定位）
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

  const handlePaperSelect = (paper: Paper) => {
    if (!textareaRef.current) return

    const cursorPos = textareaRef.current.selectionStart
    const textBeforeCursor = inputValue.substring(0, cursorPos)
    const textAfterCursor = inputValue.substring(cursorPos)
    
    // 找到@符号位置
    const atMatch = textBeforeCursor.match(/@(\S*)$/)
    if (!atMatch) return

    const atPos = cursorPos - atMatch[0].length
    const mention = `@[${paper.title}](paperId:${paper.id})`
    
    // 替换文本
    const newValue = inputValue.substring(0, atPos) + mention + textAfterCursor
    setInputValue(newValue)
    setMentionPopup(null)

    // 恢复焦点
    setTimeout(() => {
      textareaRef.current?.focus()
      const newCursorPos = atPos + mention.length
      textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }

  // 处理斜杠命令选择
  const handleSlashCommand = (command: string) => {
    setSlashCommand(null)

    if (command === 'clear') {
      setInputValue('')
      clearMessages()
    } else if (command === 'summarize') {
      const cursorPos = textareaRef.current?.selectionStart ?? inputValue.length
      const textAfterCursor = inputValue.substring(cursorPos)
      setInputValue(SUMMARIZE_PROMPT + (textAfterCursor ? `\n\n${textAfterCursor}` : ''))
    }

    textareaRef.current?.focus()
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items
    const imageFiles: File[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          imageFiles.push(file)
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault()
      try {
        const { compressImages } = await import('../../utils/imageCompressor')
        const compressedImages = await compressImages(imageFiles, 4)
        setPendingImages(prev => [...prev, ...compressedImages])
      } catch (err) {
        alert((err as Error).message)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 斜杠命令弹窗显示时，处理键盘事件
    if (slashCommand && filteredSlashCommands.length > 0) {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSlashCommand(filteredSlashCommands[slashSelectedIndex]?.command || filteredSlashCommands[0].command)
        return
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashSelectedIndex(prev => (prev + 1) % filteredSlashCommands.length)
        return
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashSelectedIndex(prev => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length)
        return
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setSlashCommand(null)
        setSlashSelectedIndex(0)
        return
      }
    }

    // 弹窗显示时，让弹窗处理键盘事件
    if (mentionPopup && mentionPopupRef.current) {
      const handled = mentionPopupRef.current.handleKeyDown(e)
      if (handled) {
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-gray-50 overflow-hidden transition-colors duration-300">
      {/* 顶部：会话列表 + 模型名 */}
      <div className="bg-gray-100 border-b border-gray-200 flex items-center min-w-0 overflow-hidden">
        <ConversationList
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelect={setCurrentConversationId}
          onDelete={deleteConversation}
          onRename={renameConversation}
          onExport={exportConversation}
          onNewConversation={createNewConversation}
        />

        {/* 模型名显示 */}
        <div className="flex-shrink-0 px-2 py-1.5 border-l border-gray-200 flex items-center">
          <span className="text-xs text-blue-600 font-medium bg-blue-100 px-2.5 py-1 rounded-full whitespace-nowrap">
            {modelName}
          </span>
        </div>
      </div>

      {/* 消息区域 */}
      <div className="flex-1 flex flex-col min-h-0">
      {/* 消息列表 */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-lg mb-2 font-medium text-gray-600">开始对话</p>
            <p className="text-sm text-gray-400">{emptyDescription}</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            // 检查是否需要在此消息前显示分割线
            const showClearDivider = lastClearAt &&
              msg.timestamp > lastClearAt &&
              (index === 0 || messages[index - 1].timestamp <= lastClearAt)

            return (
              <div key={msg.id || index}>
                {/* 上下文清除分割线 */}
                {showClearDivider && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-orange-300"></div>
                    <span className="text-xs text-orange-500 font-medium px-2">上下文已清除</span>
                    <div className="flex-1 h-px bg-orange-300"></div>
                  </div>
                )}
                <div
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
              <div
                className={`${
                  msg.role === 'user' ? 'max-w-[70%]' : 'max-w-[95%]'
                } rounded-2xl p-3.5 overflow-hidden transition-all duration-200 ${
                  msg.role === 'user'
                    ? 'bg-green-100 text-gray-800 shadow-cute'
                    : msg.addedToNote
                      ? 'bg-blue-50 text-gray-800 border-2 border-blue-200'
                      : 'bg-gray-100 text-gray-800 border border-gray-200'
                }`}
              >
                {msg.role === 'user' ? (
                  <>
                    {/* 用户消息图片 */}
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex gap-2 flex-wrap mb-2">
                        {msg.images.map((img, imgIdx) => (
                          <img
                            key={imgIdx}
                            src={`data:${img.mimeType};base64,${img.data}`}
                            alt={`图片 ${imgIdx + 1}`}
                            className="max-w-xs max-h-48 object-contain rounded cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => handleImageClick(msg.images!, imgIdx)}
                          />
                        ))}
                      </div>
                    )}
                    <MessageContent content={msg.content} />
                    
                    {/* 编辑按钮 */}
                    {!loading && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => handleEditMessage(msg.id!)}
                          className="text-xs text-green-600 hover:text-green-800 transition-colors"
                          title="编辑消息"
                        >
                          ✏️ 编辑
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* 搜索查询链接 */}
                    {msg.webSearchQueries && msg.webSearchQueries.length > 0 && (
                      <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-2">
                        <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                          <g>
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </g>
                        </svg>
                        {msg.webSearchQueries.map((q, i) => (
                          <a
                            key={i}
                            href={`https://www.google.com/search?q=${encodeURIComponent(q)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 px-3 py-1.5 rounded-full border border-gray-300 bg-gray-50 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-blue-600 hover:border-blue-300 transition-all no-underline"
                            title={`搜索: ${q}`}
                          >
                            {q}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* 思考过程 */}
                    {msg.thoughts && (
                      <details className="mb-3 rounded-lg bg-blue-50/50 overflow-hidden border border-blue-100">
                        <summary className="list-none flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100">
                              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                              </svg>
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-semibold text-blue-800">
                                {msg.thinkingTimeMs !== undefined 
                                  ? `用时 ${(msg.thinkingTimeMs / 1000).toFixed(1)}秒`
                                  : '思考过程'}
                              </span>
                            </div>
                          </div>
                          <svg className="w-4 h-4 text-blue-600 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </summary>
                        <div className="px-3 pb-3 pt-2 border-t border-blue-100 text-xs">
                          <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                            {msg.thoughts}
                          </div>
                        </div>
                      </details>
                    )}

                    {/* 正常内容 */}
                    <div className="prose prose-sm max-w-none overflow-hidden">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex, rehypeHighlight]}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>

                    {/* 操作按钮 */}
                    {!loading && (
                      <div className="mt-2 flex justify-end gap-3">
                        <button
                          onClick={() => handleCopyMessage(msg.id!, msg.content)}
                          className="text-xs transition-colors text-gray-500 hover:text-blue-600"
                          title="复制内容"
                        >
                          {copiedMessageId === msg.id ? '✓ 已复制' : '📋 复制'}
                        </button>
                        {canAddToNote && (
                          msg.addedToNote ? (
                            <span className="text-xs text-pink-600">✓ 已添加到笔记</span>
                          ) : (
                            <button
                              onClick={() => handleAddToNote(msg.id!, msg.content)}
                              disabled={addingToNoteId === msg.id}
                              className="text-xs transition-colors disabled:opacity-70 text-gray-500 hover:text-blue-600"
                              title="添加到笔记"
                            >
                              {addingToNoteId === msg.id ? '添加中...' : '📝 添加到笔记'}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </>
                )}
                <div
                  className={`text-xs mt-1 ${
                    msg.role === 'user'
                      ? 'text-green-600'
                      : msg.addedToNote
                        ? 'text-pink-400'
                        : 'text-gray-400'
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString('zh-CN')}
                </div>
              </div>
            </div>
          </div>
        )})
        )}

        {/* 尾部分割线：清空后尚无新消息时显示 */}
        {lastClearAt && messages.length > 0 && !messages.some(m => m.timestamp > lastClearAt) && (
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-orange-300"></div>
            <span className="text-xs text-orange-500 font-medium px-2">上下文已清除</span>
            <div className="flex-1 h-px bg-orange-300"></div>
          </div>
        )}

        {/* 流式输出显示 - 有思考内容、正式内容或正在加载时显示 */}
        {(streamingThought || streamingText || (loading && streamingStartTime)) && (
          <div className="flex justify-start">
            <div className="max-w-[95%] bg-gray-100 text-gray-800 border border-gray-200 rounded-2xl p-3.5 overflow-hidden transition-colors duration-200">
              {/* 流式思考过程 - 有思考内容或正在加载时显示 */}
              {(streamingThought || (loading && streamingStartTime && !streamingText)) && (
                <details className="mb-3 rounded-lg bg-blue-50/50 overflow-hidden border border-blue-100">
                  <summary className="list-none flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100">
                        <svg className="w-5 h-5 text-blue-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-blue-800">
                          {streamingStartTime ? <ThinkingTimer startTime={streamingStartTime} /> : '思考中...'}
                        </span>
                      </div>
                    </div>
                  </summary>
                  <div className="px-3 pb-3 pt-2 border-t border-blue-100 text-xs">
                    <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                      {streamingThought || '正在思考...'}
                    </div>
                  </div>
                </details>
              )}

              {/* 流式内容 */}
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

        {/* 加载指示器 - 仅在没有任何流式输出时显示 */}
        {loading && !streamingText && !streamingThought && !streamingStartTime && (
          <div className="flex justify-start">
            <div className="bg-gray-100 border border-gray-200 rounded-2xl p-3.5 transition-colors duration-200">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* 输入框 */}
      <div className="bg-gray-100 border-t border-gray-200 p-3">
        <div className="flex flex-col gap-2 max-w-3xl mx-auto">
          {/* 编辑提示 */}
          {editingMessageId && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-blue-700">
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
              placeholder="输入问题... (Enter发送)"
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none text-gray-800 text-sm bg-green-50 transition-all duration-200"
              rows={2}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={(!inputValue.trim() && pendingImages.length === 0) || loading}
              className="px-5 py-2.5 bg-blue-500 text-white text-sm rounded-xl hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 shadow-cute hover:shadow-cute-lg font-medium"
            >
              {loading ? '...' : '发送'}
            </button>
          </div>
        </div>
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

      {/* 斜杠命令弹窗 */}
      {slashCommand && filteredSlashCommands.length > 0 && (
        <div
          className="fixed z-50 bg-gray-50 border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{
            bottom: `calc(100vh - ${slashCommand.position.top}px + 8px)`,
            left: slashCommand.position.left
          }}
        >
          {filteredSlashCommands.map((item, index) => (
            <button
              key={item.command}
              onClick={() => handleSlashCommand(item.command)}
              className={`w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-2 text-sm ${
                index < filteredSlashCommands.length - 1 ? 'border-b border-gray-100' : ''
              } ${index === slashSelectedIndex ? 'bg-blue-50' : ''}`}
            >
              <span className={item.iconClassName}>{item.icon}</span>
              <div>
                <div className="font-medium text-gray-800">{item.label}</div>
                <div className="text-xs text-gray-500">{item.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 论文引用选择器 */}
      {mentionPopup && (
        <PaperMentionPopup
          ref={mentionPopupRef}
          searchText={mentionPopup.searchText}
          currentPaperId={paperId ?? 0}
          onSelect={handlePaperSelect}
          onClose={() => setMentionPopup(null)}
          position={mentionPopup.position}
        />
      )}
    </div>
  )
}
