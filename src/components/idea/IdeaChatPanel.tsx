import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import ThinkingTimer from '../chat/ThinkingTimer'
import IdeaPaperMentionPopup, { type IdeaPaperMentionPopupRef } from './IdeaPaperMentionPopup'
import type { IdeaSession } from '../../types/idea'
import type { IdeaMessage, Paper } from '../../services/storage/db'
import { exportIdeaChatToFile } from '../../services/idea/workflowStorage'

import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

interface IdeaChatPanelProps {
  session: IdeaSession | null
  messages: IdeaMessage[]
  loading: boolean
  error: string
  streamingText: string
  streamingThought: string
  streamingStartTime: Date | null
  contextReady: boolean
  onSendMessage: (content: string) => void
  onClearMessages: () => void
  onBack: () => void
}

/**
 * Idea 对话面板
 * 提供与 best_idea 相关的 AI 对话功能
 */
export default function IdeaChatPanel({
  session,
  messages,
  loading,
  error,
  streamingText,
  streamingThought,
  streamingStartTime,
  contextReady,
  onSendMessage,
  onClearMessages,
  onBack
}: IdeaChatPanelProps) {

  const [inputValue, setInputValue] = useState('')
  const [exporting, setExporting] = useState(false)
  const [mentionPopup, setMentionPopup] = useState<{
    show: boolean
    searchText: string
    position: { top: number; left: number }
  } | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionPopupRef = useRef<IdeaPaperMentionPopupRef>(null)

  // 自动滚动到最新消息
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages, streamingText])

  const handleExport = async () => {
    if (!session?.id || !session.localPath || messages.length === 0) return

    setExporting(true)
    try {
      await exportIdeaChatToFile(session.id, session.localPath)
      alert('对话已导出到 chat_history.md')
    } catch (err: any) {
      alert(`导出失败: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  const handleSend = async () => {
    if (!inputValue.trim() || loading || !contextReady) return
    const message = inputValue
    setInputValue('')
    onSendMessage(message)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInputValue(value)

    // 检测 @ 符号触发
    const cursorPos = e.target.selectionStart
    const textBeforeCursor = value.substring(0, cursorPos)
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
    // 弹窗显示时，让弹窗处理键盘事件
    if (mentionPopup && mentionPopupRef.current) {
      const handled = mentionPopupRef.current.handleKeyDown(e)
      if (handled) return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
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
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || messages.length === 0}
            className="text-xs text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="导出对话到会话目录"
          >
            {exporting ? '导出中...' : '📤 导出'}
          </button>
          <button
            onClick={onClearMessages}
            className="text-xs text-gray-500 hover:text-red-500 transition-colors"
            title="清空对话"
          >
            🗑️ 清空
          </button>
          <span className="text-xs text-gray-400 bg-blue-50 px-2 py-1 rounded">
            Gemini
          </span>
        </div>
      </div>

      {/* 消息区域 */}
      <div className="flex-1 flex flex-col min-h-0">
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-lg mb-2">💡 开始讨论</p>
              <p className="text-sm">向 AI 提问关于这个研究想法的任何问题</p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <MessageBubble key={index} message={msg} />
            ))
          )}

          {/* 流式输出 */}
          {(streamingThought || streamingText || (loading && streamingStartTime)) && (
            <div className="flex justify-start">
              <div className="max-w-[95%] bg-white text-gray-800 border border-gray-200 rounded-lg p-3 overflow-hidden">
                {/* 流式思考过程 */}
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

          {/* 加载指示器 */}
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
          <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* 输入框 */}
        <div className="flex-shrink-0 bg-white border-t p-4 relative">
          <div className="flex space-x-2">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={contextReady ? '讨论这个研究想法，输入 @ 引用论文... (Shift+Enter换行)' : '正在加载上下文...'}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-900"
              rows={3}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || loading || !contextReady}
              className="px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? '...' : contextReady ? '发送' : '加载中'}
            </button>
          </div>

          {/* 论文引用弹窗 */}
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
    </div>
  )
}

/**
 * 消息气泡组件
 */
function MessageBubble({ message }: { message: IdeaMessage }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`${
          isUser ? 'max-w-[70%]' : 'max-w-[95%]'
        } rounded-lg p-3 overflow-hidden ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-800 border border-gray-200'
        }`}
      >
        {!isUser && message.thoughts && (
          <details className="mb-3 rounded-lg bg-blue-50/50 overflow-hidden border border-blue-100">
            <summary className="list-none flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-blue-800">
                  {message.thinkingTimeMs !== undefined
                    ? `用时 ${(message.thinkingTimeMs / 1000).toFixed(1)}秒`
                    : '思考过程'}
                </span>
              </div>
            </summary>
            <div className="px-3 pb-3 pt-2 border-t border-blue-100 text-xs">
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {message.thoughts}
              </div>
            </div>
          </details>
        )}

        {isUser ? (
          <div className="whitespace-pre-wrap break-words overflow-hidden">{message.content}</div>
        ) : (
          <>
            <div className="prose prose-sm max-w-none overflow-hidden">
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
              >
                {message.content}
              </ReactMarkdown>
            </div>
            <div className="mt-2 flex justify-end">
              <button
                onClick={handleCopy}
                className="text-xs transition-colors text-gray-500 hover:text-blue-600"
                title="复制内容"
              >
                {copied ? '✓ 已复制' : '📋 复制'}
              </button>
            </div>
          </>
        )}

        <div
          className={`text-xs mt-1 ${
            isUser ? 'text-blue-100' : 'text-gray-400'
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString('zh-CN')}
        </div>
      </div>
    </div>
  )
}
