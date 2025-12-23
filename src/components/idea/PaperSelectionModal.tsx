import { useEffect, useState } from 'react'
import { getPapersByGroup, type Paper } from '../../services/storage/db'
import { hasNote } from '../../services/note/noteService'

interface PaperWithNoteStatus extends Paper {
  hasNote: boolean
}

interface Props {
  isOpen: boolean
  groupId: number
  groupName: string
  onClose: () => void
  onConfirm: (selectedPaperIds: number[]) => void
}

export function PaperSelectionModal({ isOpen, groupId, groupName, onClose, onConfirm }: Props) {
  const [papers, setPapers] = useState<PaperWithNoteStatus[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isOpen) return

    async function loadPapers() {
      setLoading(true)
      const groupPapers = await getPapersByGroup(groupId)

      const papersWithStatus = await Promise.all(
        groupPapers.map(async (paper) => ({
          ...paper,
          hasNote: paper.localPath ? await hasNote(paper.localPath) : false
        }))
      )

      setPapers(papersWithStatus)
      setSelectedIds(new Set(papersWithStatus.map(p => p.id!)))
      setLoading(false)
    }

    loadPapers()
  }, [isOpen, groupId])

  const togglePaper = (paperId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(paperId)) {
        next.delete(paperId)
      } else {
        next.add(paperId)
      }
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === papers.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(papers.map(p => p.id!)))
    }
  }

  const handleConfirm = () => {
    if (selectedIds.size === 0) {
      alert('请至少选择一篇论文')
      return
    }
    onConfirm(Array.from(selectedIds))
  }

  if (!isOpen) return null

  const selectedWithNotes = papers.filter(p => selectedIds.has(p.id!) && p.hasNote).length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white text-gray-900 rounded-lg w-[520px] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">选择参与论文</h2>
            <p className="text-sm text-gray-500">{groupName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            已选 <span className="font-medium">{selectedIds.size}</span> / {papers.length} 篇论文
            {selectedWithNotes > 0 && (
              <span className="ml-2 text-green-600">
                ({selectedWithNotes} 篇有笔记)
              </span>
            )}
          </div>
          <button
            onClick={toggleAll}
            className="text-sm text-blue-500 hover:text-blue-600"
          >
            {selectedIds.size === papers.length ? '取消全选' : '全选'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="text-center text-gray-400 py-6">加载中...</div>
          ) : papers.length === 0 ? (
            <div className="text-center text-gray-400 py-6">该分组没有论文</div>
          ) : (
            <div className="space-y-2">
              {papers.map(paper => (
                <label
                  key={paper.id}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedIds.has(paper.id!)
                      ? 'bg-blue-50 border border-blue-200'
                      : 'bg-gray-50 border border-transparent hover:bg-gray-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(paper.id!)}
                    onChange={() => togglePaper(paper.id!)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{paper.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {paper.hasNote ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <span>📝</span> 有笔记
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <span>📄</span> 无笔记
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t flex justify-between items-center">
          <div className="text-sm text-gray-500">
            只有有笔记的论文会参与 Idea 生成
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
            >
              开始生成
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
