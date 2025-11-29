import { useState, useRef, useEffect, ReactNode } from 'react'

interface ResizablePanelProps {
  leftPanel: ReactNode
  rightPanel: ReactNode
  defaultLeftWidth?: number
  minLeftWidth?: number
  minRightWidth?: number
}

function ResizablePanel({
  leftPanel,
  rightPanel,
  defaultLeftWidth = 50,
  minLeftWidth = 20,
  minRightWidth = 20,
}: ResizablePanelProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100

      if (newLeftWidth >= minLeftWidth && newLeftWidth <= 100 - minRightWidth) {
        setLeftWidth(newLeftWidth)
      }
    }

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [minLeftWidth, minRightWidth])

  const handleMouseDown = () => {
    isDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div ref={containerRef} className="flex h-full w-full">
      {/* 左侧面板 */}
      <div style={{ width: `${leftWidth}%` }} className="flex flex-col overflow-hidden">
        {leftPanel}
      </div>

      {/* 可拖拽分隔条 */}
      <div
        className="w-px bg-gray-300 hover:bg-blue-500 cursor-col-resize flex-shrink-0 relative group"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
        {/* 拖拽提示 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-0.5 h-12 bg-blue-500 rounded-full" />
        </div>
      </div>

      {/* 右侧面板 */}
      <div style={{ width: `${100 - leftWidth}%` }} className="flex flex-col overflow-hidden">
        {rightPanel}
      </div>
    </div>
  )
}

export default ResizablePanel
