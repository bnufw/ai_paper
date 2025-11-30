import { useEffect, useState } from 'react'
import { 
  getAllPapers, 
  deletePaper, 
  getAllGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  type Paper,
  type PaperGroup
} from '../../services/storage/db'
import { deletePaperFromLocal } from '../../services/storage/paperStorage'
import GroupList from './GroupList'

interface SidebarProps {
  currentPaperId: number | null
  onSelectPaper: (paperId: number) => void
  onNewPaper: () => void
  onOpenSettings: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({ 
  currentPaperId, 
  onSelectPaper, 
  onNewPaper,
  onOpenSettings,
  collapsed,
  onToggleCollapse 
}: SidebarProps) {
  const [papers, setPapers] = useState<Paper[]>([])
  const [groups, setGroups] = useState<PaperGroup[]>([])
  const [loading, setLoading] = useState(true)

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
    await renameGroup(groupId, newName)
    await loadData()
  }

  // 删除分组
  const handleDeleteGroup = async (groupId: number) => {
    await deleteGroup(groupId)
    await loadData()
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
            onCreateGroup={handleCreateGroup}
            onRenameGroup={handleRenameGroup}
            onDeleteGroup={handleDeleteGroup}
          />
        )
      )}

      {/* 底部：设置和统计信息 */}
      <div className="border-t border-gray-700">
        {!collapsed && (
          <div className="p-4 text-sm text-gray-400">
            共 {papers.length} 篇论文
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
    </div>
  )
}
