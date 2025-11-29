import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import { useChat } from '../../hooks/useChat'
import { getGeminiSettings } from '../../services/storage/db'
import ConversationList from './ConversationList'
import ThinkingTimer from './ThinkingTimer'

// 导入样式
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

interface ChatPanelProps {
  paperId: number
}

export default function ChatPanel({ paperId }: ChatPanelProps) {
  const {
    messages,
    conversations,
    currentConversationId,
    loading,
    error,
    streamingText,
    streamingThought,
    streamingStartTime,
    sendMessage,
    createNewConversation,
    setCurrentConversationId,
    deleteConversation,
    renameConversation,
    exportConversation
  } = useChat(paperId)

  const [inputValue, setInputValue] = useState('')
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('conversationListCollapsed')
    return saved ? JSON.parse(saved) : false
  })
  const [modelName, setModelName] = useState('Gemini')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // 加载模型配置
  useEffect(() => {
    async function loadModelName() {
      const settings = await getGeminiSettings()
      const displayName = settings.model === 'gemini-2.5-pro' ? '2.5 Pro' : '3 Pro'
      setModelName(displayName)
    }
    loadModelName()
  }, [])

  // 持久化折叠状态
  const toggleCollapse = () => {
    setIsCollapsed((prev: boolean) => {
      const newValue = !prev
      localStorage.setItem('conversationListCollapsed', JSON.stringify(newValue))
      return newValue
    })
  }

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
      {/* 顶部：会话列表 + 模型名 */}
      <div className="bg-white border-b flex items-center">
        <ConversationList
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelect={setCurrentConversationId}
          onDelete={deleteConversation}
          onRename={renameConversation}
          onExport={exportConversation}
          onNewConversation={createNewConversation}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
        
        {/* 模型名显示 */}
        <div className="px-4 py-2 border-l flex items-center">
          <span className="text-sm text-gray-700 font-medium bg-blue-100 px-3 py-1.5 rounded whitespace-nowrap">
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
                className={`${
                  msg.role === 'user' ? 'max-w-[70%]' : 'max-w-[95%]'
                } rounded-lg p-3 ${
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
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex, rehypeHighlight]}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </>
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

        {/* 流式输出显示 - 有思考内容、正式内容或正在加载时显示 */}
        {(streamingThought || streamingText || (loading && streamingStartTime)) && (
          <div className="flex justify-start">
            <div className="max-w-[95%] bg-white text-gray-800 border border-gray-200 rounded-lg p-3">
              {/* 流式思考过程 - 有思考内容或正在加载时显示 */}
              {(streamingThought || (loading && streamingStartTime && !streamingText)) && (
                <details open className="mb-3 rounded-lg bg-blue-50/50 overflow-hidden border border-blue-100">
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
                <div className="prose prose-sm max-w-none">
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
    </div>
  )
}
