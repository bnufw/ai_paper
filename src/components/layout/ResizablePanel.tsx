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
  const [collapsed, setCollapsed] = useState(false)
  const [widthBeforeCollapse, setWidthBeforeCollapse] = useState(defaultLeftWidth)
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current || collapsed) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100

      if (newLeftWidth >= minLeftWidth && newLeftWidth <= 100 - minRightWidth) {
        setLeftWidth(newLeftWidth)
      }
    }

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        setIsDragging(false)
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
  }, [minLeftWidth, minRightWidth, collapsed])

  const handleMouseDown = () => {
    if (collapsed) return
    isDraggingRef.current = true
    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const toggleCollapse = () => {
    if (!collapsed) {
      setWidthBeforeCollapse(leftWidth)
    } else {
      setLeftWidth(widthBeforeCollapse)
    }
    setCollapsed(!collapsed)
  }

  return (
    <div ref={containerRef} className="flex h-full w-full">
      {/* 左侧面板 */}
      <div
        style={{ width: collapsed ? '100%' : `${leftWidth}%` }}
        className={`flex flex-col min-w-0 overflow-hidden ${!isDragging ? 'transition-[width] duration-300' : ''}`}
      >
        {leftPanel}
      </div>

      {/* 分隔条与折叠按钮 */}
      <div className="relative flex-shrink-0">
        {/* 可拖拽分隔条 */}
        <div
          className={`w-px h-full bg-gray-300 flex-shrink-0 relative group ${
            collapsed ? '' : 'hover:bg-blue-500 cursor-col-resize'
          }`}
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
          {/* 拖拽提示 - 仅在未折叠时显示 */}
          {!collapsed && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-0.5 h-12 bg-blue-500 rounded-full" />
            </div>
          )}
        </div>

        {/* 折叠/展开按钮 */}
        <button
          onClick={toggleCollapse}
          className={`absolute top-1/2 -translate-y-1/2 z-30 w-5 h-10 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 hover:border-blue-400 flex items-center justify-center transition-all ${
            collapsed ? '-right-2.5' : '-right-2.5'
          }`}
          title={collapsed ? '展开对话面板' : '折叠对话面板'}
        >
          <svg 
            className={`w-3 h-3 text-gray-500 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* 右侧面板 */}
      <div
        style={{ width: collapsed ? '0%' : `${100 - leftWidth}%` }}
        className={`flex flex-col min-w-0 overflow-hidden ${!isDragging ? 'transition-[width] duration-300' : ''}`}
      >
        {rightPanel}
      </div>
    </div>
  )
}

export default ResizablePanel
