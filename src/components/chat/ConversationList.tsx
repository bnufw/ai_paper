import { useState } from 'react'
import { Conversation } from '../../services/storage/db'

interface ConversationListProps {
  conversations: Conversation[]
  currentConversationId: number | null
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onRename: (id: number, newTitle: string) => void
  onExport: (id: number) => void
  onNewConversation: () => void
}

export default function ConversationList({
  conversations,
  currentConversationId,
  onSelect,
  onDelete,
  onRename,
  onExport,
  onNewConversation
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  const handleStartEdit = (conv: Conversation) => {
    setEditingId(conv.id!)
    setEditingTitle(conv.title)
  }

  const handleSaveEdit = (id: number) => {
    if (editingTitle.trim()) {
      try {
        onRename(id, editingTitle.trim())
        setEditingId(null)
      } catch (err) {
        alert('重命名失败,请重试')
        console.error(err)
      }
    } else {
      alert('标题不能为空')
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === 'Enter') {
      handleSaveEdit(id)
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  const handleDeleteClick = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    onDelete(id)
  }

  const handleExportClick = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    try {
      onExport(id)
    } catch (err) {
      alert('导出失败,请重试')
      console.error(err)
    }
  }

  return (
    <div className="flex-1 min-w-0 flex items-center bg-white">
      {/* 新对话按钮 */}
      <div className="px-2 py-1.5 border-r flex items-center">
        <button
          onClick={onNewConversation}
          className="bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 flex items-center space-x-1 text-xs"
        >
          <span>+</span>
          <span>新对话</span>
        </button>
      </div>

      {/* 对话列表 - 横向滚动 */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex items-center h-full">
          {conversations.length === 0 ? (
            <div className="px-4 py-2 text-gray-500 text-sm whitespace-nowrap">
              暂无对话
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id!)}
                onMouseEnter={() => setHoveredId(conv.id!)}
                onMouseLeave={() => setHoveredId(null)}
                className={`px-4 py-2 border-r cursor-pointer transition-colors whitespace-nowrap ${
                  conv.id === currentConversationId
                    ? 'bg-blue-50 border-b-2 border-b-blue-600'
                    : 'hover:bg-gray-50'
                }`}
              >
                {/* 标题编辑 */}
                {editingId === conv.id ? (
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, conv.id!)}
                    onBlur={() => handleSaveEdit(conv.id!)}
                    className="px-2 py-1 border rounded text-sm w-40 text-gray-900"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="flex items-center space-x-2">
                    <div className="text-sm text-gray-800 max-w-[200px] truncate">
                      {conv.title}
                    </div>

                    {/* 操作按钮 */}
                    {hoveredId === conv.id && (
                      <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleStartEdit(conv)}
                          className="p-1 hover:bg-gray-200 rounded"
                          title="重命名"
                        >
                          <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => handleExportClick(e, conv.id!)}
                          className="p-1 hover:bg-gray-200 rounded"
                          title="导出"
                        >
                          <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(e, conv.id!)}
                          className="p-1 hover:bg-red-100 rounded"
                          title="删除"
                        >
                          <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
