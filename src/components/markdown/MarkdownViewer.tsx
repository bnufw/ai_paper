import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import MermaidChart from './MermaidChart'
import { db, type Paper, type PaperImage } from '../../services/storage/db'

// 导入样式
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

interface MarkdownViewerProps {
  paperId: number
}

export default function MarkdownViewer({ paperId }: MarkdownViewerProps) {
  const [paper, setPaper] = useState<Paper | null>(null)
  const [images, setImages] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadPaper() {
      setLoading(true)

      // 加载论文
      const paperData = await db.papers.get(paperId)
      if (!paperData) {
        setLoading(false)
        return
      }

      // 加载图片
      const imageData = await db.images.where('paperId').equals(paperId).toArray()
      const imageMap: Record<number, string> = {}
      imageData.forEach((img: PaperImage) => {
        imageMap[img.imageIndex] = img.imageData
      })

      setPaper(paperData)
      setImages(imageMap)
      setLoading(false)
    }

    loadPaper()
  }, [paperId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">加载中...</div>
      </div>
    )
  }

  if (!paper) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">论文不存在</div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-white">
      <div className="max-w-4xl mx-auto p-8">
        {/* 论文标题 */}
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          {paper.title}
        </h1>

        {/* Markdown内容 */}
        <div className="prose prose-lg max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeKatex, rehypeHighlight]}
            components={{
              // 自定义图片渲染
              img: ({ src, alt }) => {
                // 匹配 image_N.png 格式
                const match = src?.match(/image_(\d+)\.png/)
                if (match) {
                  const imageIndex = parseInt(match[1])
                  const base64 = images[imageIndex]

                  if (base64) {
                    return (
                      <img
                        src={`data:image/jpeg;base64,${base64}`}
                        alt={alt || `图片 ${imageIndex}`}
                        className="max-w-full h-auto rounded-lg shadow-md my-4"
                      />
                    )
                  }
                }

                // 如果不是本地图片，直接显示
                return <img src={src} alt={alt} className="max-w-full h-auto" />
              },

              // 自定义代码块渲染（处理Mermaid图表）
              code: ({ className, children, ...props }) => {
                const match = /language-(\w+)/.exec(className || '')
                const language = match ? match[1] : ''
                const isInline = !className

                // 处理Mermaid图表
                if (!isInline && language === 'mermaid') {
                  return <MermaidChart code={String(children).replace(/\n$/, '')} />
                }

                // 普通代码块
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                )
              }
            }}
          >
            {paper.markdown}
          </ReactMarkdown>
        </div>

        {/* 元数据 */}
        <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-gray-500">
          <p>创建时间: {new Date(paper.createdAt).toLocaleString('zh-CN')}</p>
          <p>更新时间: {new Date(paper.updatedAt).toLocaleString('zh-CN')}</p>
        </div>
      </div>
    </div>
  )
}
