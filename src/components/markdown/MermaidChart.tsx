import { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

interface MermaidChartProps {
  code: string
}

// 初始化Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose'
})

export default function MermaidChart({ code }: MermaidChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const renderChart = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        const { svg } = await mermaid.render(id, code)
        if (containerRef.current) {
          containerRef.current.innerHTML = svg
        }
      } catch (error) {
        console.error('Mermaid渲染失败:', error)
        if (containerRef.current) {
          containerRef.current.innerHTML = `<pre class="text-red-600">图表渲染失败</pre>`
        }
      }
    }

    renderChart()
  }, [code])

  return <div ref={containerRef} className="my-4" />
}
