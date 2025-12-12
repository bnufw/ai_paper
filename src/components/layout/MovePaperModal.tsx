/**
 * 移动论文到分组弹窗
 */

import { useEffect, useMemo, useState } from 'react'
import type { Paper, PaperGroup } from '../../services/storage/db'

interface Props {
  isOpen: boolean
  onClose: () => void
  paper: Paper | null
  groups: PaperGroup[]
  onMove: (paperId: number, groupId?: number) => Promise<void>
}

export default function MovePaperModal({ isOpen, onClose, paper, groups, onMove }: Props) {
  const [search, setSearch] = useState('')
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setMoving(false)
    }
  }, [isOpen])

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return groups
    return groups.filter(g => g.name.toLowerCase().includes(term))
  }, [groups, search])

  if (!isOpen || !paper) return null

  const currentGroupId = paper.groupId

  const handleMove = async (groupId?: number) => {
    if (!paper.id) return
    if (groupId === currentGroupId) return
    setMoving(true)
    try {
      await onMove(paper.id, groupId)
      onClose()
    } catch (err) {
      console.error('移动论文失败:', err)
      alert('移动失败，请重试')
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white text-gray-900 rounded-lg w-[520px] max-h-[70vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">移动到分组</h2>
            <p className="text-sm text-gray-500 truncate">{paper.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 搜索 */}
        <div className="px-5 py-3 border-b">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索分组名称"
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        {/* 分组列表 */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <button
            disabled={moving || !currentGroupId}
            onClick={() => handleMove(undefined)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors text-gray-900 ${
              !currentGroupId
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'hover:bg-gray-100'
            }`}
          >
            未分类 {currentGroupId ? '' : '（当前）'}
          </button>

          {filteredGroups.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-6">没有匹配的分组</div>
          ) : (
            filteredGroups.map(g => {
              const isCurrent = currentGroupId === g.id
              return (
                <button
                  key={g.id}
                  disabled={moving || isCurrent}
                  onClick={() => handleMove(g.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors text-gray-900 ${
                    isCurrent
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  {g.name} {isCurrent ? '（当前）' : ''}
                </button>
              )
            })
          )}
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 border-t flex justify-end">
          <button
            onClick={onClose}
            disabled={moving}
            className="px-4 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
