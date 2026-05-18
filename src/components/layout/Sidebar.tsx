import { useEffect, useRef, useState } from 'react'
import {
  getAllPapers,
  deletePaper,
  getAllGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  movePaperToGroup,
  togglePaperExcludeFromIdea,
  getIdeaSession,
  type Paper,
  type PaperGroup,
  type IdeaSession
} from '../../services/storage/db'
import { deletePaperFromLocal } from '../../services/storage/paperStorage'
import { cleanupPaperCache } from '../../services/ai/cacheService'
import { batchUpdatePaperTitles } from '../../utils/titleExtractor'
import GroupList from './GroupList'
import IdeaSessionList from './IdeaSessionList'
import { IdeaWorkflowRunner, IdeaSettingsModal } from '../idea'
import ThemeToggle from '../common/ThemeToggle'

interface SidebarProps {
  currentPaperId: number | null
  currentIdeaSessionId: number | null
  onSelectPaper: (paperId: number) => void
  onSelectIdeaSession: (session: IdeaSession) => void
  onDeleteIdeaSession: (sessionId: number) => void
  onNewPaper: () => void
  onOpenSettings: () => void
  collapsed: boolean
  onToggleCollapse: () => void
  refreshTrigger?: number
}

export default function Sidebar({
  currentPaperId,
  currentIdeaSessionId,
  onSelectPaper,
  onSelectIdeaSession,
  onDeleteIdeaSession,
  onNewPaper,
  onOpenSettings,
  collapsed,
  onToggleCollapse,
  refreshTrigger
}: SidebarProps) {
  const [papers, setPapers] = useState<Paper[]>([])
  const [groups, setGroups] = useState<PaperGroup[]>([])
  const [loading, setLoading] = useState(true)

  // Idea 工作流相关状态
  const [ideaWorkflowOpen, setIdeaWorkflowOpen] = useState(false)
  const [ideaSettingsOpen, setIdeaSettingsOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<{ id: number; name: string } | null>(null)
  const [ideaSessionRefreshTrigger, setIdeaSessionRefreshTrigger] = useState(0)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const createHandledRef = useRef(false)

  // 批量更新标题状态
  const [isUpdatingTitles, setIsUpdatingTitles] = useState(false)

  // 加载论文和分组列表
  // showLoading: 是否显示加载状态（内部刷新时为 false，避免卸载 GroupList 导致状态丢失）
  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const [allPapers, allGroups] = await Promise.all([
      getAllPapers(),
      getAllGroups()
    ])
    setPapers(allPapers)
    setGroups(allGroups)
    if (showLoading) setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // 监听 refreshTrigger 变化，重新加载数据
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      loadData()
    }
  }, [refreshTrigger])

  // 删除论文
  const handleDelete = async (paperId: number) => {
    if (!confirm('确定要删除这篇论文吗？此操作不可恢复。')) {
      return
    }

    const paper = papers.find(p => p.id === paperId)

    // 删除本地文件
    if (paper?.localPath) {
      try {
        await deletePaperFromLocal(paper.localPath)
      } catch (err) {
        console.error('删除本地文件失败:', err)
      }
    }

    // 清理远端缓存（后台执行，不阻塞）
    cleanupPaperCache(paperId).catch(err => {
      console.error('清理远端缓存失败:', err)
    })

    await deletePaper(paperId)
    await loadData()

    // 如果删除的是当前论文，清空选择
    if (paperId === currentPaperId) {
      onNewPaper()
    }
  }

  // 创建新分组
  const handleCreateGroup = async (name: string) => {
    if (!name.trim()) return

    await createGroup(name.trim())
    await loadData()
  }

  const finishCreateGroup = () => {
    if (createHandledRef.current) return
    createHandledRef.current = true
    if (newGroupName.trim()) {
      handleCreateGroup(newGroupName.trim())
    }
    setCreatingGroup(false)
    setNewGroupName('')
  }

  const cancelCreateGroup = () => {
    createHandledRef.current = true
    setCreatingGroup(false)
    setNewGroupName('')
  }

  // 重命名分组
  const handleRenameGroup = async (groupId: number, newName: string) => {
    await renameGroup(groupId, newName)
    await loadData()
  }

  // 删除分组
  const handleDeleteGroup = async (groupId: number) => {
    await deleteGroup(groupId)
    await loadData()
  }

  const handleMovePaper = async (paperId: number, groupId?: number) => {
    try {
      await movePaperToGroup(paperId, groupId)
      await loadData(false)

      if (paperId === currentPaperId) {
        onSelectPaper(paperId)
      }
    } catch (err) {
      console.error('移动论文分组失败:', err)
      alert('移动失败: ' + (err as Error).message)
    }
  }

  // 打开 Idea 生成工作流
  const handleGenerateIdea = (groupId: number, groupName: string) => {
    setSelectedGroup({ id: groupId, name: groupName })
    setIdeaWorkflowOpen(true)
  }

  // 切换论文是否从 Idea 上下文中排除
  const handleToggleExcludeFromIdea = async (paperId: number) => {
    await togglePaperExcludeFromIdea(paperId)
    await loadData(false)  // 不显示加载状态，避免 GroupList 卸载导致展开状态丢失
  }

  const refreshIdeaSessions = () => {
    setIdeaSessionRefreshTrigger(v => v + 1)
  }

  const handleOpenIdeaSession = async (sessionId: number) => {
    const session = await getIdeaSession(sessionId)
    if (!session) return

    onSelectIdeaSession(session)
    setIdeaWorkflowOpen(false)
    setSelectedGroup(null)
    refreshIdeaSessions()
  }

  // 批量更新论文标题
  const handleBatchUpdateTitles = async () => {
    if (papers.length === 0) return
    if (!confirm('将从论文内容中重新识别标题，是否继续？')) return

    setIsUpdatingTitles(true)
    try {
      const result = await batchUpdatePaperTitles()
      await loadData()
      alert(`更新完成！\n共 ${result.total} 篇论文\n更新 ${result.updated} 篇\n跳过 ${result.skipped} 篇`)
    } catch (err) {
      console.error('批量更新标题失败:', err)
      alert('更新失败: ' + (err as Error).message)
    } finally {
      setIsUpdatingTitles(false)
    }
  }

  return (
    <div className={`bg-gray-100 border-r border-gray-200 text-gray-800 flex flex-col transition-all duration-300 ${
      collapsed ? 'w-16' : 'w-64'
    }`}>
      {/* 折叠/展开按钮 */}
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        {!collapsed && (
          <button
            onClick={onNewPaper}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 px-4 rounded-xl text-sm shadow-cute transition-all duration-200 hover:shadow-cute-lg hover:-translate-y-0.5"
          >
            + 导入论文
          </button>
        )}
        <button
          onClick={onToggleCollapse}
          className={`text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-lg p-1.5 transition-all duration-200 ${
            collapsed ? 'w-full flex justify-center' : 'ml-2'
          }`}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {collapsed ? (
        /* 折叠视图：仅显示图标 */
        <div className="flex-1 flex flex-col items-center py-4 space-y-3">
          <button
            onClick={onNewPaper}
            className="w-10 h-10 bg-blue-500 hover:bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-cute transition-all duration-200 hover:scale-105"
            title="导入论文"
          >
            +
          </button>
          {papers.slice(0, 5).map((paper) => (
            <button
              key={paper.id}
              onClick={() => onSelectPaper(paper.id!)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs transition-all duration-200 ${
                currentPaperId === paper.id
                  ? 'bg-blue-500 text-white shadow-cute'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-600'
              }`}
              title={paper.title}
            >
              📄
            </button>
          ))}
        </div>
      ) : (
        /* 展开视图：显示分组列表 */
        loading ? (
          <div className="p-4 text-center text-gray-500">
            <span className="animate-pulse-soft">加载中...</span>
          </div>
        ) : papers.length === 0 ? (
          <div className="flex-1 overflow-y-auto">
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
                  className="w-full bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm outline-none"
                  placeholder="输入分组名称..."
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => {
                    createHandledRef.current = false
                    setCreatingGroup(true)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  + 新建分组
                </button>
              )}
            </div>
            {groups.length > 0 && (
              <div className="px-2 space-y-1">
                {groups.map(group => (
                  <div key={group.id} className="px-3 py-2 text-sm text-gray-600 bg-gray-50 rounded-lg">
                    📁 {group.name}
                  </div>
                ))}
              </div>
            )}
            <div className="p-4 text-center text-gray-500">
              <p className="mb-2">暂无论文</p>
              <p className="text-sm text-gray-400">点击上方按钮上传</p>
            </div>
          </div>
        ) : (
          <GroupList
            groups={groups}
            papers={papers}
            currentPaperId={currentPaperId}
            onSelectPaper={onSelectPaper}
            onDeletePaper={handleDelete}
            onCreateGroup={handleCreateGroup}
            onRenameGroup={handleRenameGroup}
            onDeleteGroup={handleDeleteGroup}
            onMovePaper={handleMovePaper}
            onGenerateIdea={handleGenerateIdea}
            onToggleExcludeFromIdea={handleToggleExcludeFromIdea}
          />
        )
      )}

      {/* Idea 会话历史列表 */}
      {!collapsed && (
        <IdeaSessionList
          currentSessionId={currentIdeaSessionId}
          onSelectSession={onSelectIdeaSession}
          onDeleteSession={onDeleteIdeaSession}
          refreshTrigger={ideaSessionRefreshTrigger}
          collapsed={collapsed}
        />
      )}

      {/* 底部：设置和统计信息 */}
      <div className="border-t border-gray-200 bg-gray-50">
        {!collapsed && (
          <div className="p-4 text-sm text-gray-500 flex justify-between items-center">
            <span>共 {papers.length} 篇论文</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBatchUpdateTitles}
                disabled={isUpdatingTitles || papers.length === 0}
                className="text-gray-400 hover:text-blue-500 transition-colors p-1 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title="重新识别所有论文标题"
              >
                {isUpdatingTitles ? '⏳' : '📝'}
              </button>
              <button
                onClick={() => setIdeaSettingsOpen(true)}
                className="text-gray-400 hover:text-blue-500 transition-colors p-1 rounded-lg hover:bg-blue-50"
                title="Idea 工作流设置"
              >
                🚀
              </button>
            </div>
          </div>
        )}

        {/* 主题切换和设置按钮 */}
        <div className={`p-3 flex ${collapsed ? 'flex-col items-center gap-2' : 'items-center justify-between'}`}>
          {!collapsed && <ThemeToggle />}
          <button
            onClick={onOpenSettings}
            className={`bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-xl transition-all duration-200 hover:shadow-sm ${
              collapsed ? 'w-10 h-10 flex justify-center items-center p-0' : ''
            }`}
            title="设置"
          >
            {collapsed ? '⚙️' : '⚙️ 设置'}
          </button>
        </div>
      </div>

      {/* Idea 工作流弹窗 */}
      {selectedGroup && (
        <IdeaWorkflowRunner
          isOpen={ideaWorkflowOpen}
          groupId={selectedGroup.id}
          groupName={selectedGroup.name}
          onComplete={refreshIdeaSessions}
          onOpenSession={handleOpenIdeaSession}
          onClose={() => {
            setIdeaWorkflowOpen(false)
            setSelectedGroup(null)
          }}
        />
      )}

      {/* Idea 设置弹窗 */}
      <IdeaSettingsModal
        isOpen={ideaSettingsOpen}
        onClose={() => setIdeaSettingsOpen(false)}
      />
    </div>
  )
}
