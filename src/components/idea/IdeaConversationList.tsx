import { useState } from 'react'
import type { IdeaConversation } from '../../services/storage/db'

interface IdeaConversationListProps {
  conversations: IdeaConversation[]
  currentConversationId: number | null
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onRename: (id: number, newTitle: string) => void
  onClear: () => void
  onNewConversation: () => void
}

export default function IdeaConversationList({
  conversations,
  currentConversationId,
  onSelect,
  onDelete,
  onRename,
  onClear,
  onNewConversation
}: IdeaConversationListProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  const handleStartEdit = (conv: IdeaConversation) => {
    setEditingId(conv.id!)
    setEditingTitle(conv.title)
  }

  const handleSaveEdit = (id: number) => {
    if (editingTitle.trim()) {
      onRename(id, editingTitle.trim())
      setEditingId(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === 'Enter') {
      handleSaveEdit(id)
    } else if (e.key === 'Escape') {
      setEditingId(null)
    }
  }

  return (
    <div className="flex items-center border-b bg-white min-h-[40px]">
      {/* 新建对话按钮 */}
      <button
        onClick={onNewConversation}
        className="flex-shrink-0 px-3 py-2 text-blue-600 hover:bg-blue-50 border-r"
        title="新建对话"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

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
                    ? 'bg-yellow-50 border-b-2 border-b-yellow-600'
                    : 'hover:bg-gray-50'
                }`}
              >
                {editingId === conv.id ? (
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, conv.id!)}
                    onBlur={() => handleSaveEdit(conv.id!)}
                    className="w-32 px-1 py-0.5 text-sm border rounded"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm max-w-[120px] truncate">
                      {conv.title}
                    </span>

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
                          onClick={() => {
                            if (confirm('确定删除此对话？')) {
                              onDelete(conv.id!)
                            }
                          }}
                          className="p-1 hover:bg-red-100 rounded"
                          title="删除"
                        >
                          <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* 清空当前对话按钮 */}
      <button
        onClick={onClear}
        className="flex-shrink-0 px-3 py-2 text-gray-500 hover:text-red-500 hover:bg-red-50 border-l"
        title="清空当前对话"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  )
}
