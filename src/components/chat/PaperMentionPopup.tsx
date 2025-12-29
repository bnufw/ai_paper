import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { db, type Paper } from '../../services/storage/db'

interface PaperMentionPopupProps {
  searchText: string
  currentPaperId: number
  onSelect: (paper: Paper) => void
  onClose: () => void
  position: { top: number; left: number }
}

export interface PaperMentionPopupRef {
  handleKeyDown: (e: React.KeyboardEvent) => boolean
}

export default forwardRef<PaperMentionPopupRef, PaperMentionPopupProps>(function PaperMentionPopup({
  searchText,
  currentPaperId,
  onSelect,
  onClose,
  position
}, ref) {
  const [papers, setPapers] = useState<Paper[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const popupRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    async function loadPapers() {
      const allPapers = await db.papers.orderBy('createdAt').reverse().toArray()
      
      // 只显示有本地 paper.md 的论文（localPath 存在）
      let filtered = allPapers.filter(p => p.id !== currentPaperId && p.localPath)

      if (searchText) {
        const query = searchText.toLowerCase()
        filtered = filtered.filter(p => p.title.toLowerCase().includes(query))
      }
      
      setPapers(filtered)
      setSelectedIndex(0)
    }

    loadPapers()
  }, [searchText, currentPaperId])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // 选中项变化时自动滚动到可见区域
  useEffect(() => {
    const selectedItem = itemRefs.current[selectedIndex]
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  // 暴露键盘处理方法给父组件
  useImperativeHandle(ref, () => ({
    handleKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => (prev < papers.length - 1 ? prev + 1 : prev))
        return true
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev))
        return true
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (papers[selectedIndex]) {
          onSelect(papers[selectedIndex])
        }
        return true
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return true
      }
      return false
    }
  }), [papers, selectedIndex, onSelect, onClose])

  if (papers.length === 0) {
    return (
      <div
        ref={popupRef}
        className="fixed bg-gray-50 border border-gray-300 rounded-lg shadow-lg p-3 z-50 min-w-[300px]"
        style={{ 
          top: position.top,
          left: position.left,
          transform: 'translateY(-100%) translateY(-8px)'
        }}
      >
        <div className="text-sm text-gray-500">没有可引用的论文（需有本地 markdown）</div>
      </div>
    )
  }

  return (
    <div
      ref={popupRef}
      className="fixed bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[300px] max-w-[500px]"
      style={{ 
        top: position.top,
        left: position.left,
        transform: 'translateY(-100%) translateY(-8px)'
      }}
    >
      <div className="p-2 border-b border-gray-200 text-xs text-gray-500">
        选择要引用的论文 (↑↓选择, Enter确认, Esc取消)
      </div>
      <div ref={listRef} className="max-h-60 overflow-y-auto">
        {papers.map((paper, index) => (
          <button
            key={paper.id}
            ref={el => { itemRefs.current[index] = el }}
            onClick={() => onSelect(paper)}
            className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors ${
              index === selectedIndex ? 'bg-blue-100' : ''
            }`}
          >
            <div className="text-sm font-medium text-gray-900 truncate">
              {paper.title}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {new Date(paper.createdAt).toLocaleDateString('zh-CN')}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
})
