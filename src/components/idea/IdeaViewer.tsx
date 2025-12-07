import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'

import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

interface IdeaViewerProps {
  currentIdeaSlug: string
  bestIdea: string | null
  allIdeas: Map<string, string>
  onIdeaChange: (slug: string) => void
}

/**
 * Idea 内容查看器
 * 支持切换查看 best_idea 和各模型生成的 idea
 */
export default function IdeaViewer({
  currentIdeaSlug,
  bestIdea,
  allIdeas,
  onIdeaChange
}: IdeaViewerProps) {
  // 构建选项列表
  const options = [
    { value: 'best_idea', label: '🏆 Best Idea' },
    ...Array.from(allIdeas.keys()).map(slug => ({
      value: slug,
      label: `💡 ${slug}`
    }))
  ]

  // 获取当前内容
  const currentContent = currentIdeaSlug === 'best_idea'
    ? bestIdea
    : allIdeas.get(currentIdeaSlug)

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 border-b bg-gray-50 px-4 py-2">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">查看：</label>
          <select
            value={currentIdeaSlug}
            onChange={(e) => onIdeaChange(e.target.value)}
            className="flex-1 max-w-xs px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400">
            共 {allIdeas.size} 个候选
          </span>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {currentContent ? (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[rehypeKatex, rehypeHighlight]}
            >
              {currentContent}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg mb-2">📄 暂无内容</p>
            <p className="text-sm">该 Idea 内容为空或加载失败</p>
          </div>
        )}
      </div>
    </div>
  )
}
