import { useState, useEffect, useRef } from 'react'
import { db, type Paper } from '../../services/storage/db'

interface PaperMentionPopupProps {
  searchText: string
  currentPaperId: number
  onSelect: (paper: Paper) => void
  onClose: () => void
  position: { top: number; left: number }
}

export default function PaperMentionPopup({
  searchText,
  currentPaperId,
  onSelect,
  onClose,
  position
}: PaperMentionPopupProps) {
  const [papers, setPapers] = useState<Paper[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadPapers() {
      const allPapers = await db.papers.orderBy('createdAt').reverse().toArray()
      
      // 过滤掉当前论文
      let filtered = allPapers.filter(p => p.id !== currentPaperId)
      
      // 如果有搜索文本,进行过滤
      if (searchText) {
        const query = searchText.toLowerCase()
        filtered = filtered.filter(p => p.title.toLowerCase().includes(query))
      }
      
      setPapers(filtered.slice(0, 5))
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev < papers.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (papers[selectedIndex]) {
        onSelect(papers[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (papers.length === 0) {
    return (
      <div
        ref={popupRef}
        className="absolute bg-white border border-gray-300 rounded-lg shadow-lg p-3 z-50 min-w-[300px]"
        style={{ top: position.top, left: position.left }}
      >
        <div className="text-sm text-gray-500">没有找到其他论文</div>
      </div>
    )
  }

  return (
    <div
      ref={popupRef}
      className="absolute bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[300px] max-w-[500px]"
      style={{ top: position.top, left: position.left }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="p-2 border-b border-gray-200 text-xs text-gray-500">
        选择要引用的论文 (↑↓选择, Enter确认, Esc取消)
      </div>
      <div className="max-h-60 overflow-y-auto">
        {papers.map((paper, index) => (
          <button
            key={paper.id}
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
}
