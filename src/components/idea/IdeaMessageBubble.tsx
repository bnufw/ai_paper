import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import type { IdeaMessage, MessageImage } from '../../services/storage/db'

interface IdeaMessageBubbleProps {
  message: IdeaMessage
  isLoading?: boolean
  onEdit?: (messageId: number) => void
  onRegenerate?: (messageId: number) => void
  onCreateBranch?: (messageId: number) => void
  onImageClick?: (images: MessageImage[], index: number) => void
}

export default function IdeaMessageBubble({
  message,
  isLoading,
  onEdit,
  onRegenerate,
  onCreateBranch,
  onImageClick
}: IdeaMessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

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
        {isUser ? (
          <>
            {/* 用户消息图片 */}
            {message.images && message.images.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-2">
                {message.images.map((img, imgIdx) => (
                  <img
                    key={imgIdx}
                    src={`data:${img.mimeType};base64,${img.data}`}
                    alt={`图片 ${imgIdx + 1}`}
                    className="max-w-xs max-h-48 object-contain rounded cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => onImageClick?.(message.images!, imgIdx)}
                  />
                ))}
              </div>
            )}
            <div className="whitespace-pre-wrap break-words overflow-hidden">
              {message.content}
            </div>

            {/* 编辑按钮 */}
            {!isLoading && onEdit && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => onEdit(message.id!)}
                  className="text-xs text-blue-100 hover:text-white transition-colors"
                  title="编辑消息"
                >
                  ✏️ 编辑
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Web 搜索查询链接 */}
            {message.webSearchQueries && message.webSearchQueries.length > 0 && (
              <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-2">
                <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                  <g>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </g>
                </svg>
                {message.webSearchQueries.map((q, i) => (
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
            {message.thoughts && (
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

            {/* 正常内容 */}
            <div className="prose prose-sm max-w-none overflow-hidden">
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {/* 操作按钮 */}
            {!isLoading && (
              <div className="mt-2 flex justify-end gap-3">
                {/* 重新生成按钮 */}
                {onRegenerate && (
                  <button
                    onClick={() => onRegenerate(message.id!)}
                    className="text-xs transition-colors text-gray-500 hover:text-blue-600"
                    title="重新生成回复"
                  >
                    🔄 重新生成
                  </button>
                )}

                {/* 创建分支按钮 */}
                {onCreateBranch && (
                  <button
                    onClick={() => onCreateBranch(message.id!)}
                    className="text-xs transition-colors text-gray-500 hover:text-green-600"
                    title="从此消息创建新的对话分支"
                  >
                    🔀 创建分支
                  </button>
                )}

                {/* 复制按钮 */}
                <button
                  onClick={handleCopy}
                  className="text-xs transition-colors text-gray-500 hover:text-blue-600"
                  title="复制为 Markdown"
                >
                  {copied ? '✓ 已复制' : '📋 复制'}
                </button>
              </div>
            )}
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
