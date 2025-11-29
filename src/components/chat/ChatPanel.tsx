import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import { useChat } from '../../hooks/useChat'

// 导入样式
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

interface ChatPanelProps {
  paperId: number
}

export default function ChatPanel({ paperId }: ChatPanelProps) {
  const {
    messages,
    loading,
    error,
    streamingText,
    sendMessage,
    createNewConversation
  } = useChat(paperId)

  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // 自动滚动到最新消息
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages, streamingText])

  const handleSend = async () => {
    if (!inputValue.trim() || loading) return

    const message = inputValue
    setInputValue('')
    await sendMessage(message)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 顶部工具栏 */}
      <div className="bg-white border-b p-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h3 className="font-semibold text-gray-800">AI 对话</h3>
          <span className="text-xs text-gray-500 bg-blue-100 px-2 py-1 rounded">
            Gemini
          </span>
        </div>

        <button
          onClick={createNewConversation}
          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
          disabled={loading}
        >
          + 新对话
        </button>
      </div>

      {/* 消息列表 */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg mb-2">👋 开始对话</p>
            <p className="text-sm">向AI提问关于这篇论文的任何问题</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-800 border border-gray-200'
                }`}
              >
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex, rehypeHighlight]}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
                <div
                  className={`text-xs mt-1 ${
                    msg.role === 'user' ? 'text-blue-100' : 'text-gray-400'
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString('zh-CN')}
                </div>
              </div>
            </div>
          ))
        )}

        {/* 流式输出显示 */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-white text-gray-800 border border-gray-200 rounded-lg p-3">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkMath, remarkGfm]}
                  rehypePlugins={[rehypeKatex, rehypeHighlight]}
                >
                  {streamingText}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* 加载指示器 */}
        {loading && !streamingText && (
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

        <div ref={messagesEndRef} />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* 输入框 */}
      <div className="bg-white border-t p-4">
        <div className="flex space-x-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入您的问题... (Shift+Enter换行,Enter发送)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            rows={3}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || loading}
            className="px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? '...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}
