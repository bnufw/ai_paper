import { useEffect, useState } from 'react'
import { getAllPapers, deletePaper, type Paper } from '../../services/storage/db'

interface SidebarProps {
  currentPaperId: number | null
  onSelectPaper: (paperId: number) => void
  onNewPaper: () => void
}

export default function Sidebar({ currentPaperId, onSelectPaper, onNewPaper }: SidebarProps) {
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)

  // 加载论文列表
  const loadPapers = async () => {
    setLoading(true)
    const allPapers = await getAllPapers()
    setPapers(allPapers)
    setLoading(false)
  }

  useEffect(() => {
    loadPapers()
  }, [])

  // 删除论文
  const handleDelete = async (paperId: number, e: React.MouseEvent) => {
    e.stopPropagation() // 阻止触发选择事件

    if (!confirm('确定要删除这篇论文吗？此操作不可恢复。')) {
      return
    }

    await deletePaper(paperId)
    await loadPapers()

    // 如果删除的是当前论文，清空选择
    if (paperId === currentPaperId) {
      onNewPaper()
    }
  }

  return (
    <div className="w-64 bg-gray-800 text-white flex flex-col">
      {/* 顶部：新建按钮 */}
      <div className="p-4 border-b border-gray-700">
        <button
          onClick={onNewPaper}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg"
        >
          + 上传新论文
        </button>
      </div>

      {/* 论文列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-400">
            加载中...
          </div>
        ) : papers.length === 0 ? (
          <div className="p-4 text-center text-gray-400">
            <p className="mb-2">暂无论文</p>
            <p className="text-sm">点击上方按钮上传</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {papers.map((paper) => (
              <div
                key={paper.id}
                onClick={() => onSelectPaper(paper.id!)}
                className={`p-3 rounded-lg cursor-pointer transition-colors group ${
                  currentPaperId === paper.id
                    ? 'bg-blue-600'
                    : 'hover:bg-gray-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate mb-1">
                      {paper.title}
                    </h4>
                    <p className="text-xs text-gray-400">
                      {new Date(paper.createdAt).toLocaleDateString('zh-CN')}
                    </p>
                  </div>

                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => handleDelete(paper.id!, e)}
                    className="ml-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部：统计信息 */}
      <div className="p-4 border-t border-gray-700 text-sm text-gray-400">
        共 {papers.length} 篇论文
      </div>
    </div>
  )
}
