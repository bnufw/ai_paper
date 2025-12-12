import { useState } from 'react'
import { type Paper, type PaperGroup, updatePaperTitle } from '../../services/storage/db'
import GroupNoteModal from '../note/GroupNoteModal'
import DomainKnowledgeModal from '../knowledge/DomainKnowledgeModal'
import ContextMenu, { type ContextMenuItem } from '../common/ContextMenu'
import MovePaperModal from './MovePaperModal'

interface GroupListProps {
  groups: PaperGroup[]
  papers: Paper[]
  currentPaperId: number | null
  onSelectPaper: (paperId: number) => void
  onDeletePaper: (paperId: number) => void
  onRenamePaper?: (paperId: number, newTitle: string) => Promise<void>
  onMovePaperToGroup?: (paperId: number, groupId?: number) => Promise<void>
  onCreateGroup: () => void
  onRenameGroup: (groupId: number, newName: string) => void
  onDeleteGroup: (groupId: number) => void
  onGenerateIdea?: (groupId: number, groupName: string) => void
}

export default function GroupList({
  groups,
  papers,
  currentPaperId,
  onSelectPaper,
  onDeletePaper,
  onRenamePaper,
  onMovePaperToGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onGenerateIdea
}: GroupListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [noteModalGroup, setNoteModalGroup] = useState<string | null>(null)
  const [knowledgeModalGroup, setKnowledgeModalGroup] = useState<{ id: number; name: string } | null>(null)

  // 论文相关状态
  const [paperContextMenu, setPaperContextMenu] = useState<{ x: number; y: number; paperId: number } | null>(null)
  const [editingPaperId, setEditingPaperId] = useState<number | null>(null)
  const [editingPaperTitle, setEditingPaperTitle] = useState('')
  const [movePaperId, setMovePaperId] = useState<number | null>(null)
  const [draggingPaperId, setDraggingPaperId] = useState<number | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<number | null>(null)

  // 分组右键菜单状态
  const [groupContextMenu, setGroupContextMenu] = useState<{ x: number; y: number; groupId: number } | null>(null)

  // 切换分组展开/折叠
  const toggleGroup = (groupId: number) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId)
    } else {
      newExpanded.add(groupId)
    }
    setExpandedGroups(newExpanded)
  }

  // 开始重命名
  const startRename = (group: PaperGroup, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingGroupId(group.id!)
    setEditingName(group.name)
  }

  // 完成重命名
  const finishRename = () => {
    if (editingGroupId !== null && editingName.trim()) {
      onRenameGroup(editingGroupId, editingName.trim())
    }
    setEditingGroupId(null)
    setEditingName('')
  }

  // 删除分组
  const handleDeleteGroup = (groupId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('确定删除此分组？论文将移至未分类。')) {
      onDeleteGroup(groupId)
    }
  }

  // 论文重命名相关函数
  const startEditPaper = (paper: Paper) => {
    setEditingPaperId(paper.id!)
    setEditingPaperTitle(paper.title)
  }

  const cancelEditPaper = () => {
    setEditingPaperId(null)
    setEditingPaperTitle('')
  }

  const finishEditPaper = async () => {
    if (!editingPaperId || !editingPaperTitle.trim()) {
      cancelEditPaper()
      return
    }

    try {
      if (onRenamePaper) {
        await onRenamePaper(editingPaperId, editingPaperTitle.trim())
      } else {
        // 如果没有提供回调，直接更新数据库
        await updatePaperTitle(editingPaperId, editingPaperTitle.trim())
      }
      cancelEditPaper()
    } catch (err) {
      console.error('重命名论文失败:', err)
      alert('重命名失败，请重试')
    }
  }

  const handlePaperContextMenu = (e: React.MouseEvent, paper: Paper) => {
    e.preventDefault()
    e.stopPropagation()
    setPaperContextMenu({ x: e.clientX, y: e.clientY, paperId: paper.id! })
  }

  const handlePaperDoubleClick = (e: React.MouseEvent, paper: Paper) => {
    e.stopPropagation()
    startEditPaper(paper)
  }

  const getPaperContextMenuItems = (paper: Paper): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        label: '重命名',
        icon: '✏️',
        onClick: () => startEditPaper(paper)
      }
    ]

    if (onMovePaperToGroup) {
      items.push(
        { divider: true },
        {
          label: '移动到分组…',
          icon: '📁',
          onClick: () => setMovePaperId(paper.id!)
        }
      )
    }

    items.push(
      { divider: true },
      {
        label: '删除',
        icon: '🗑️',
        onClick: () => onDeletePaper(paper.id!),
        danger: true
      }
    )

    return items
  }

  // 分组右键菜单相关函数
  const handleGroupContextMenu = (e: React.MouseEvent, group: PaperGroup) => {
    e.preventDefault()
    e.stopPropagation()
    setGroupContextMenu({ x: e.clientX, y: e.clientY, groupId: group.id! })
  }

  const getGroupContextMenuItems = (group: PaperGroup): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        label: '重命名',
        icon: '✏️',
        onClick: () => {
          setEditingGroupId(group.id!)
          setEditingName(group.name)
        }
      }
    ]

    if (onGenerateIdea) {
      items.push({
        label: '生成 Idea',
        icon: '🚀',
        onClick: () => onGenerateIdea(group.id!, group.name)
      })
    }

    items.push(
      { divider: true },
      {
        label: '删除分组',
        icon: '🗑️',
        onClick: () => {
          if (confirm('确定删除此分组？论文将移至未分类。')) {
            onDeleteGroup(group.id!)
          }
        },
        danger: true
      }
    )

    return items
  }

  // 按分组分类论文
  const uncategorizedPapers = papers.filter(p => !p.groupId)
  const groupedPapers = new Map<number, Paper[]>()
  
  papers.forEach(paper => {
    if (paper.groupId) {
      if (!groupedPapers.has(paper.groupId)) {
        groupedPapers.set(paper.groupId, [])
      }
      groupedPapers.get(paper.groupId)!.push(paper)
    }
  })

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 创建分组按钮 */}
      <div className="p-2">
        <button
          onClick={onCreateGroup}
          className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
        >
          + 新建分组
        </button>
      </div>

      {/* 未分类 */}
      <div className="mb-2">
        <div
          className={`px-3 py-2 flex items-center justify-between group ${
            dragOverGroupId === -1 ? 'bg-gray-700' : ''
          }`}
          onDragOver={(e) => {
            if (!onMovePaperToGroup) return
            e.preventDefault()
            setDragOverGroupId(-1)
          }}
          onDragLeave={() => setDragOverGroupId(null)}
          onDrop={async (e) => {
            if (!onMovePaperToGroup) return
            e.preventDefault()
            const paperId = Number(e.dataTransfer.getData('paperId'))
            if (paperId) {
              await onMovePaperToGroup(paperId, undefined)
            }
            setDragOverGroupId(null)
            setDraggingPaperId(null)
          }}
        >
          <div className="flex items-center">
            {uncategorizedPapers.length > 0 && (
              <span
                className="mr-2 cursor-pointer hover:text-blue-400"
                onClick={() => toggleGroup(-1)}
              >
                {expandedGroups.has(-1) ? '▼' : '▶'}
              </span>
            )}
            {uncategorizedPapers.length === 0 && <span className="mr-2 opacity-0">▶</span>}
            <span className="text-sm text-gray-400">未分类</span>
            <span className="ml-2 text-xs text-gray-500">({uncategorizedPapers.length})</span>
          </div>
          {/* 未分类笔记按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setNoteModalGroup('未分类')
            }}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white"
            title="分组笔记"
          >
            📝
          </button>
        </div>

        {expandedGroups.has(-1) && uncategorizedPapers.length > 0 && (
          <div className="pl-6 space-y-1">
            {uncategorizedPapers.map(paper => (
              <PaperItem
                key={paper.id}
                paper={paper}
                isSelected={currentPaperId === paper.id}
                onSelect={() => onSelectPaper(paper.id!)}
                onDelete={(e) => {
                  e.stopPropagation()
                  onDeletePaper(paper.id!)
                }}
                onContextMenu={(e) => handlePaperContextMenu(e, paper)}
                onDoubleClick={(e) => handlePaperDoubleClick(e, paper)}
                isEditing={editingPaperId === paper.id}
                editingTitle={editingPaperTitle}
                onTitleChange={setEditingPaperTitle}
                onFinishEdit={finishEditPaper}
                onCancelEdit={cancelEditPaper}
                onDragStart={() => setDraggingPaperId(paper.id!)}
                onDragEnd={() => setDraggingPaperId(null)}
                isDragging={draggingPaperId === paper.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* 分组列表 */}
      {groups.map(group => {
        const groupPapers = groupedPapers.get(group.id!) || []
        const isExpanded = expandedGroups.has(group.id!)
        
        return (
          <div key={group.id} className="mb-2">
            <div
              className={`px-3 py-2 flex items-center justify-between group hover:bg-gray-700 ${
                dragOverGroupId === group.id ? 'bg-gray-700' : ''
              }`}
              onDragOver={(e) => {
                if (!onMovePaperToGroup) return
                e.preventDefault()
                setDragOverGroupId(group.id!)
              }}
              onDragLeave={() => setDragOverGroupId(null)}
              onDrop={async (e) => {
                if (!onMovePaperToGroup) return
                e.preventDefault()
                const paperId = Number(e.dataTransfer.getData('paperId'))
                if (paperId) {
                  await onMovePaperToGroup(paperId, group.id)
                }
                setDragOverGroupId(null)
                setDraggingPaperId(null)
              }}
            >
              <div className="flex items-center flex-1 min-w-0">
                <span
                  className="mr-2 cursor-pointer hover:text-blue-400"
                  onClick={() => toggleGroup(group.id!)}
                >
                  {isExpanded ? '▼' : '▶'}
                </span>

                {editingGroupId === group.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={finishRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishRename()
                      if (e.key === 'Escape') {
                        setEditingGroupId(null)
                        setEditingName('')
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-gray-600 text-white px-2 py-1 rounded text-sm"
                    autoFocus
                  />
                ) : (
                  <span
                    className="text-sm font-medium truncate cursor-pointer hover:text-blue-400"
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setEditingGroupId(group.id!)
                      setEditingName(group.name)
                    }}
                    onContextMenu={(e) => handleGroupContextMenu(e, group)}
                  >
                    {group.name}
                  </span>
                )}

                <span className="ml-2 text-xs text-gray-500">({groupPapers.length})</span>
              </div>

              {/* 分组操作按钮 */}
              <div className="flex items-center ml-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setKnowledgeModalGroup({ id: group.id!, name: group.name })
                  }}
                  className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300 mr-2"
                  title="领域知识"
                >
                  📚
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setNoteModalGroup(group.name)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white mr-2"
                  title="分组笔记"
                >
                  📝
                </button>
                {onGenerateIdea && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onGenerateIdea(group.id!, group.name)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-yellow-400 hover:text-yellow-300 mr-2"
                    title="生成 Idea"
                  >
                    🚀
                  </button>
                )}
                <button
                  onClick={(e) => startRename(group, e)}
                  className="text-gray-400 hover:text-white mr-2"
                  title="重命名"
                >
                  ✏️
                </button>
                <button
                  onClick={(e) => handleDeleteGroup(group.id!, e)}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
                  title="删除分组"
                >
                  🗑️
                </button>
              </div>
            </div>

            {isExpanded && groupPapers.length > 0 && (
              <div className="pl-6 space-y-1">
                {groupPapers.map(paper => (
                  <PaperItem
                    key={paper.id}
                    paper={paper}
                    isSelected={currentPaperId === paper.id}
                    onSelect={() => onSelectPaper(paper.id!)}
                    onDelete={(e) => {
                      e.stopPropagation()
                      onDeletePaper(paper.id!)
                    }}
                    onContextMenu={(e) => handlePaperContextMenu(e, paper)}
                    onDoubleClick={(e) => handlePaperDoubleClick(e, paper)}
                    isEditing={editingPaperId === paper.id}
                    editingTitle={editingPaperTitle}
                    onTitleChange={setEditingPaperTitle}
                    onFinishEdit={finishEditPaper}
                    onCancelEdit={cancelEditPaper}
                    onDragStart={() => setDraggingPaperId(paper.id!)}
                    onDragEnd={() => setDraggingPaperId(null)}
                    isDragging={draggingPaperId === paper.id}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* 分组笔记弹窗 */}
      <GroupNoteModal
        isOpen={noteModalGroup !== null}
        onClose={() => setNoteModalGroup(null)}
        groupName={noteModalGroup || ''}
      />

      {/* 领域知识弹窗 */}
      <DomainKnowledgeModal
        isOpen={knowledgeModalGroup !== null}
        onClose={() => setKnowledgeModalGroup(null)}
        groupId={knowledgeModalGroup?.id ?? 0}
        groupName={knowledgeModalGroup?.name || ''}
      />

      {/* 论文右键菜单 */}
      {paperContextMenu && (
        <ContextMenu
          x={paperContextMenu.x}
          y={paperContextMenu.y}
          items={getPaperContextMenuItems(
            papers.find(p => p.id === paperContextMenu.paperId)!
          )}
          onClose={() => setPaperContextMenu(null)}
        />
      )}

      {/* 分组右键菜单 */}
      {groupContextMenu && (
        <ContextMenu
          x={groupContextMenu.x}
          y={groupContextMenu.y}
          items={getGroupContextMenuItems(
            groups.find(g => g.id === groupContextMenu.groupId)!
          )}
          onClose={() => setGroupContextMenu(null)}
        />
      )}

      {/* 移动论文弹窗 */}
      {onMovePaperToGroup && (
        <MovePaperModal
          isOpen={movePaperId !== null}
          onClose={() => setMovePaperId(null)}
          paper={papers.find(p => p.id === movePaperId) || null}
          groups={groups}
          onMove={onMovePaperToGroup}
        />
      )}
    </div>
  )
}

// 论文项组件
function PaperItem({
  paper,
  isSelected,
  onSelect,
  onDelete,
  onContextMenu,
  onDoubleClick,
  isEditing,
  editingTitle,
  onTitleChange,
  onFinishEdit,
  onCancelEdit,
  onDragStart,
  onDragEnd,
  isDragging
}: {
  paper: Paper
  isSelected: boolean
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
  isEditing: boolean
  editingTitle: string
  onTitleChange: (value: string) => void
  onFinishEdit: () => void
  onCancelEdit: () => void
  onDragStart: () => void
  onDragEnd: () => void
  isDragging: boolean
}) {
  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.setData('paperId', String(paper.id))
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={`p-3 rounded-lg cursor-pointer transition-colors group ${
        isDragging
          ? 'bg-gray-700 opacity-70'
          : isSelected
          ? 'bg-blue-600'
          : 'hover:bg-gray-700'
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={onFinishEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onFinishEdit()
                if (e.key === 'Escape') onCancelEdit()
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-gray-600 text-white px-2 py-1 rounded text-sm mb-1"
              autoFocus
            />
          ) : (
            <h4
              className="font-medium truncate mb-1 text-sm"
              onDoubleClick={onDoubleClick}
            >
              {paper.title}
            </h4>
          )}
          <p className="text-xs text-gray-400">
            {new Date(paper.createdAt).toLocaleDateString('zh-CN')}
          </p>
        </div>

        <button
          onClick={onDelete}
          className="ml-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
          title="删除"
        >
          🗑️
        </button>
      </div>
    </div>
  )
}
