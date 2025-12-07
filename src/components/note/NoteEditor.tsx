import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import MermaidChart from '../markdown/MermaidChart'

import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

interface NoteEditorProps {
  content: string
  onChange: (content: string) => void
  onSave: () => void
  mode: 'edit' | 'preview'
}

export default function NoteEditor({ content, onChange, onSave, mode }: NoteEditorProps) {

  // 监听 Ctrl+S 保存
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        onSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSave])

  // 自动保存(防抖)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content) {
        onSave()
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [content, onSave])

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {mode === 'edit' ? (
          <textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none text-gray-900"
            placeholder="在此编写笔记..."
          />
        ) : (
          <div className="h-full overflow-auto">
            <div className="max-w-4xl mx-auto p-8 prose prose-lg max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
                components={{
                  code: ({ className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '')
                    const language = match ? match[1] : ''
                    const isInline = !className

                    if (!isInline && language === 'mermaid') {
                      return <MermaidChart code={String(children).replace(/\n$/, '')} />
                    }

                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    )
                  }
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
