import { useEffect, useState } from 'react'
import {
  getAllPapers,
  deletePaper,
  getAllGroups,
  createGroup,
  renameGroupWithIdeaSessions,
  deleteGroup,
  updatePaperTitle,
  movePaperToGroup,
  type Paper,
  type PaperGroup,
  type IdeaSession
} from '../../services/storage/db'
import { deletePaperFromLocal } from '../../services/storage/paperStorage'
import { cleanupPaperCache } from '../../services/ai/cacheService'
import { checkDirectoryPermission, getDirectoryHandle, renameDirectory } from '../../services/storage/fileSystem'
import GroupList from './GroupList'
import IdeaSessionList from './IdeaSessionList'
import { IdeaWorkflowRunner, IdeaSettingsModal, CrossSessionEvaluator, PaperSelectionModal } from '../idea'

interface SidebarProps {
  currentPaperId: number | null
  currentIdeaSessionId: number | null
  onSelectPaper: (paperId: number) => void
  onSelectIdeaSession: (session: IdeaSession) => void
  onNewPaper: () => void
  onOpenSettings: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({
  currentPaperId,
  currentIdeaSessionId,
  onSelectPaper,
  onSelectIdeaSession,
  onNewPaper,
  onOpenSettings,
  collapsed,
  onToggleCollapse
}: SidebarProps) {
  const [papers, setPapers] = useState<Paper[]>([])
  const [groups, setGroups] = useState<PaperGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [dataVersion, setDataVersion] = useState(0)

  // Idea 工作流相关状态
  const [ideaWorkflowOpen, setIdeaWorkflowOpen] = useState(false)
  const [ideaSettingsOpen, setIdeaSettingsOpen] = useState(false)
  const [crossSessionEvaluatorOpen, setCrossSessionEvaluatorOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<{ id: number; name: string } | null>(null)
  const [paperSelectionOpen, setPaperSelectionOpen] = useState(false)
  const [selectedPaperIds, setSelectedPaperIds] = useState<number[]>([])

  // 加载论文和分组列表
  const loadData = async () => {
    setLoading(true)
    const [allPapers, allGroups] = await Promise.all([
      getAllPapers(),
      getAllGroups()
    ])
    setPapers(allPapers)
    setGroups(allGroups)
    setLoading(false)
    setDataVersion(v => v + 1)
  }

  useEffect(() => {
    loadData()
  }, [])

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
  const handleCreateGroup = async () => {
    const name = prompt('请输入分组名称:')
    if (!name || !name.trim()) return

    await createGroup(name.trim())
    await loadData()
  }

  // 重命名分组
  const handleRenameGroup = async (groupId: number, newName: string) => {
    const trimmedNewName = newName.trim()
    if (!trimmedNewName) return

    try {
      // 先尝试重命名本地文件系统中的分组目录（若已配置）
      const rootHandle = await getDirectoryHandle()
      if (rootHandle) {
        const hasPermission = await checkDirectoryPermission(rootHandle)
        if (hasPermission) {
          const oldGroup = groups.find(g => g.id === groupId)
          const oldName = oldGroup?.name
          if (oldName && oldName !== trimmedNewName) {
            // 仅当旧目录存在时才执行重命名
            let oldExists = true
            try {
              await rootHandle.getDirectoryHandle(oldName)
            } catch {
              oldExists = false
            }

            if (oldExists) {
              let newExists = false
              try {
                await rootHandle.getDirectoryHandle(trimmedNewName)
                newExists = true
              } catch {
                newExists = false
              }

              if (newExists) {
                const ok = confirm(`目标分组目录 "${trimmedNewName}" 已存在，是否合并目录内容？\n（合并会覆盖同名文件）`)
                if (!ok) {
                  return
                }
              }

              await renameDirectory(rootHandle, oldName, trimmedNewName)
            }
          }
        }
      }

      // 同步更新数据库中的分组名与 Idea 会话冗余字段
      await renameGroupWithIdeaSessions(groupId, trimmedNewName)
      await loadData()
    } catch (err) {
      console.error('重命名分组失败:', err)
      alert('重命名分组失败，请重试')
    }
  }

  // 重命名论文
  const handleRenamePaper = async (paperId: number, newTitle: string) => {
    await updatePaperTitle(paperId, newTitle)
    await loadData()
  }

  // 移动论文到分组
  const handleMovePaperToGroup = async (paperId: number, groupId?: number) => {
    await movePaperToGroup(paperId, groupId)
    await loadData()
  }

  // 删除分组
  const handleDeleteGroup = async (groupId: number) => {
    await deleteGroup(groupId)
    await loadData()
  }

  // 打开 Idea 生成工作流（先打开论文选择对话框）
  const handleGenerateIdea = (groupId: number, groupName: string) => {
    setSelectedGroup({ id: groupId, name: groupName })
    setPaperSelectionOpen(true)
  }

  // 论文选择确认后启动工作流
  const handlePaperSelectionConfirm = (paperIds: number[]) => {
    setSelectedPaperIds(paperIds)
    setPaperSelectionOpen(false)
    setIdeaWorkflowOpen(true)
  }

  return (
    <div className={`bg-gray-800 text-white flex flex-col transition-all duration-300 ${
      collapsed ? 'w-16' : 'w-64'
    }`}>
      {/* 折叠/展开按钮 */}
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        {!collapsed && (
          <button
            onClick={onNewPaper}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm"
          >
            + 上传新论文
          </button>
        )}
        <button
          onClick={onToggleCollapse}
          className={`text-gray-400 hover:text-white transition-colors ${
            collapsed ? 'w-full flex justify-center' : 'ml-2'
          }`}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {collapsed ? (
        /* 折叠视图：仅显示图标 */
        <div className="flex-1 flex flex-col items-center py-4 space-y-4">
          <button
            onClick={onNewPaper}
            className="w-10 h-10 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center"
            title="上传新论文"
          >
            +
          </button>
          {papers.slice(0, 5).map((paper) => (
            <button
              key={paper.id}
              onClick={() => onSelectPaper(paper.id!)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs ${
                currentPaperId === paper.id
                  ? 'bg-blue-600'
                  : 'bg-gray-700 hover:bg-gray-600'
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
          <div className="p-4 text-center text-gray-400">
            加载中...
          </div>
        ) : papers.length === 0 ? (
          <div className="p-4 text-center text-gray-400">
            <p className="mb-2">暂无论文</p>
            <p className="text-sm">点击上方按钮上传</p>
          </div>
        ) : (
          <GroupList
            groups={groups}
            papers={papers}
            currentPaperId={currentPaperId}
            onSelectPaper={onSelectPaper}
            onDeletePaper={handleDelete}
            onRenamePaper={handleRenamePaper}
            onMovePaperToGroup={handleMovePaperToGroup}
            onCreateGroup={handleCreateGroup}
            onRenameGroup={handleRenameGroup}
            onDeleteGroup={handleDeleteGroup}
            onGenerateIdea={handleGenerateIdea}
          />
        )
      )}

      {/* Idea 会话历史列表 */}
      {!collapsed && (
        <>
          <IdeaSessionList
            currentSessionId={currentIdeaSessionId}
            onSelectSession={onSelectIdeaSession}
            collapsed={collapsed}
            refreshTrigger={dataVersion}
          />
          {/* 跨会话综合评估入口 */}
          <div className="px-4 pb-2">
            <button
              onClick={() => setCrossSessionEvaluatorOpen(true)}
              className="w-full text-left px-3 py-2 text-sm text-yellow-400 hover:bg-gray-700 rounded flex items-center gap-2"
            >
              <span>📊</span>
              <span>跨会话综合评估</span>
            </button>
          </div>
        </>
      )}

      {/* 底部：设置和统计信息 */}
      <div className="border-t border-gray-700">
        {!collapsed && (
          <div className="p-4 text-sm text-gray-400 flex justify-between items-center">
            <span>共 {papers.length} 篇论文</span>
            <button
              onClick={() => setIdeaSettingsOpen(true)}
              className="text-gray-400 hover:text-yellow-400 transition-colors"
              title="Idea 工作流设置"
            >
              🚀
            </button>
          </div>
        )}
        <div className="p-4">
          <button
            onClick={onOpenSettings}
            className={`w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors ${
              collapsed ? 'flex justify-center' : ''
            }`}
            title="设置"
          >
            {collapsed ? '⚙️' : '⚙️ 设置'}
          </button>
        </div>
      </div>

      {/* 论文选择弹窗 */}
      {selectedGroup && (
        <PaperSelectionModal
          isOpen={paperSelectionOpen}
          groupId={selectedGroup.id}
          groupName={selectedGroup.name}
          onClose={() => {
            setPaperSelectionOpen(false)
            setSelectedGroup(null)
          }}
          onConfirm={handlePaperSelectionConfirm}
        />
      )}

      {/* Idea 工作流弹窗 */}
      {selectedGroup && (
        <IdeaWorkflowRunner
          isOpen={ideaWorkflowOpen}
          groupId={selectedGroup.id}
          groupName={selectedGroup.name}
          selectedPaperIds={selectedPaperIds}
          onClose={() => {
            setIdeaWorkflowOpen(false)
            setSelectedGroup(null)
            setSelectedPaperIds([])
          }}
        />
      )}

      {/* Idea 设置弹窗 */}
      <IdeaSettingsModal
        isOpen={ideaSettingsOpen}
        onClose={() => setIdeaSettingsOpen(false)}
      />

      {/* 跨会话综合评估弹窗 */}
      <CrossSessionEvaluator
        isOpen={crossSessionEvaluatorOpen}
        onClose={() => setCrossSessionEvaluatorOpen(false)}
      />
    </div>
  )
}
