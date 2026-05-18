import { useRef, useState } from 'react'
import { type Paper, type PaperGroup } from '../../services/storage/db'
import GroupNoteModal from '../note/GroupNoteModal'
import DomainKnowledgeModal from '../knowledge/DomainKnowledgeModal'

interface GroupListProps {
  groups: PaperGroup[]
  papers: Paper[]
  currentPaperId: number | null
  onSelectPaper: (paperId: number) => void
  onDeletePaper: (paperId: number) => void
  onCreateGroup: (name: string) => void
  onRenameGroup: (groupId: number, newName: string) => void
  onDeleteGroup: (groupId: number) => void
  onMovePaper?: (paperId: number, groupId?: number) => Promise<void> | void
  onGenerateIdea?: (groupId: number, groupName: string) => void
  onToggleExcludeFromIdea?: (paperId: number) => void
}

export default function GroupList({
  groups,
  papers,
  currentPaperId,
  onSelectPaper,
  onDeletePaper,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onMovePaper,
  onGenerateIdea,
  onToggleExcludeFromIdea
}: GroupListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [noteModalGroup, setNoteModalGroup] = useState<string | null>(null)
  const [knowledgeModalGroup, setKnowledgeModalGroup] = useState<{ id: number; name: string } | null>(null)
  const [movingPaperId, setMovingPaperId] = useState<number | null>(null)
  const [movingBusyPaperId, setMovingBusyPaperId] = useState<number | null>(null)
  const createHandledRef = useRef(false)

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
    if (editingGroupId && editingName.trim()) {
      onRenameGroup(editingGroupId, editingName.trim())
    }
    setEditingGroupId(null)
    setEditingName('')
  }

  const finishCreateGroup = () => {
    if (createHandledRef.current) return
    createHandledRef.current = true
    if (newGroupName.trim()) {
      onCreateGroup(newGroupName.trim())
    }
    setCreatingGroup(false)
    setNewGroupName('')
  }

  const cancelCreateGroup = () => {
    createHandledRef.current = true
    setCreatingGroup(false)
    setNewGroupName('')
  }

  // 删除分组
  const handleDeleteGroup = (groupId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('确定删除此分组？论文将移至未分类。')) {
      onDeleteGroup(groupId)
    }
  }

  const handleMovePaper = async (paperId: number, groupId?: number) => {
    if (!onMovePaper) return

    setMovingBusyPaperId(paperId)
    try {
      await onMovePaper(paperId, groupId)
      setMovingPaperId(null)
    } finally {
      setMovingBusyPaperId(null)
    }
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
        {creatingGroup ? (
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onBlur={finishCreateGroup}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishCreateGroup()
              if (e.key === 'Escape') cancelCreateGroup()
            }}
            className="w-full bg-gray-600 text-white px-3 py-2 rounded-lg text-sm outline-none"
            placeholder="输入分组名称..."
            autoFocus
          />
        ) : (
          <button
            onClick={() => {
              createHandledRef.current = false
              setCreatingGroup(true)
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            + 新建分组
          </button>
        )}
      </div>

      {/* 未分类 */}
      <div className="mb-2">
        <div
          onClick={() => uncategorizedPapers.length > 0 && toggleGroup(-1)}
          className={`px-3 py-2 flex items-center justify-between group ${
            uncategorizedPapers.length > 0 ? 'cursor-pointer hover:bg-gray-700' : ''
          }`}
        >
          <div className="flex items-center">
            {uncategorizedPapers.length > 0 && (
              <span className="mr-2">{expandedGroups.has(-1) ? '▼' : '▶'}</span>
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
                onToggleExclude={onToggleExcludeFromIdea ? (e) => {
                  e.stopPropagation()
                  onToggleExcludeFromIdea(paper.id!)
                } : undefined}
                groups={groups}
                isMoving={movingPaperId === paper.id}
                isMoveBusy={movingBusyPaperId === paper.id}
                onStartMove={onMovePaper ? (e) => {
                  e.stopPropagation()
                  setMovingPaperId(movingPaperId === paper.id ? null : paper.id!)
                } : undefined}
                onMove={(groupId) => handleMovePaper(paper.id!, groupId)}
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
              onClick={() => toggleGroup(group.id!)}
              className="px-3 py-2 cursor-pointer hover:bg-gray-700 flex items-center justify-between group"
            >
              <div className="flex items-center flex-1 min-w-0">
                <span className="mr-2">{isExpanded ? '▼' : '▶'}</span>
                
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
                  <span className="text-sm font-medium truncate">{group.name}</span>
                )}
                
                <span className="ml-2 text-xs text-gray-500">({groupPapers.length})</span>
              </div>

              {/* 分组操作按钮 */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center ml-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setKnowledgeModalGroup({ id: group.id!, name: group.name })
                  }}
                  className="text-blue-400 hover:text-blue-300 mr-2"
                  title="领域知识"
                >
                  📚
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setNoteModalGroup(group.name)
                  }}
                  className="text-gray-400 hover:text-white mr-2"
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
                    className="text-yellow-400 hover:text-yellow-300 mr-2"
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
                  className="text-red-400 hover:text-red-300"
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
                    onToggleExclude={onToggleExcludeFromIdea ? (e) => {
                      e.stopPropagation()
                      onToggleExcludeFromIdea(paper.id!)
                    } : undefined}
                    groups={groups}
                    isMoving={movingPaperId === paper.id}
                    isMoveBusy={movingBusyPaperId === paper.id}
                    onStartMove={onMovePaper ? (e) => {
                      e.stopPropagation()
                      setMovingPaperId(movingPaperId === paper.id ? null : paper.id!)
                    } : undefined}
                    onMove={(groupId) => handleMovePaper(paper.id!, groupId)}
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
    </div>
  )
}

// 论文项组件
function PaperItem({
  paper,
  isSelected,
  onSelect,
  onDelete,
  onToggleExclude,
  groups,
  isMoving,
  isMoveBusy,
  onStartMove,
  onMove
}: {
  paper: Paper
  isSelected: boolean
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
  onToggleExclude?: (e: React.MouseEvent) => void
  groups: PaperGroup[]
  isMoving: boolean
  isMoveBusy: boolean
  onStartMove?: (e: React.MouseEvent) => void
  onMove: (groupId?: number) => void
}) {
  const isExcluded = paper.excludeFromIdea
  const moveTargets = [
    { id: undefined, name: '未分类' },
    ...groups.map(group => ({ id: group.id, name: group.name }))
  ].filter(group => group.id !== paper.groupId)

  return (
    <div
      onClick={onSelect}
      className={`p-3 rounded-lg cursor-pointer transition-colors group ${
        isSelected ? 'bg-blue-600' : 'hover:bg-gray-700'
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium truncate mb-1 text-sm ${isExcluded ? 'text-gray-500' : ''}`}>
            {paper.title}
          </h4>
          <p className="text-xs text-gray-400">
            {new Date(paper.createdAt).toLocaleDateString('zh-CN')}
          </p>
        </div>

        <div className="flex items-center ml-2">
          {onStartMove && moveTargets.length > 0 && (
            <button
              onClick={onStartMove}
              disabled={isMoveBusy}
              className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300 transition-opacity mr-1 disabled:opacity-50"
              title="移动到分组"
            >
              {isMoveBusy ? '⏳' : '↪'}
            </button>
          )}
          {onToggleExclude && (
            <button
              onClick={onToggleExclude}
              className={`opacity-0 group-hover:opacity-100 transition-opacity mr-1 ${
                isExcluded ? 'text-gray-500' : 'text-green-400 hover:text-green-300'
              }`}
              title={isExcluded ? '已从 Idea 上下文排除，点击恢复' : '在 Idea 上下文中，点击排除'}
            >
              {isExcluded ? '🚫' : '🧠'}
            </button>
          )}
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
            title="删除"
          >
            🗑️
          </button>
        </div>
      </div>

      {isMoving && moveTargets.length > 0 && (
        <select
          value=""
          disabled={isMoveBusy}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation()
            const value = e.target.value
            if (!value) return
            onMove(value === '__uncategorized__' ? undefined : Number(value))
          }}
          className="mt-2 w-full bg-gray-600 text-white text-xs px-2 py-1 rounded outline-none"
        >
          <option value="" disabled>移动到...</option>
          {moveTargets.map(group => (
            <option key={group.id ?? '__uncategorized__'} value={group.id ?? '__uncategorized__'}>
              {group.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
