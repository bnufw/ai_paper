import { useState, useEffect } from 'react'
import { getAllIdeaSessions, deleteIdeaSession, type IdeaSession } from '../../services/storage/db'

interface IdeaSessionListProps {
  currentSessionId: number | null
  onSelectSession: (session: IdeaSession) => void
  collapsed: boolean
  refreshTrigger?: number
}

/**
 * Idea 会话历史列表
 */
export default function IdeaSessionList({
  currentSessionId,
  onSelectSession,
  collapsed,
  refreshTrigger
}: IdeaSessionListProps) {
  const [sessions, setSessions] = useState<IdeaSession[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(true)

  // 加载会话列表
  useEffect(() => {
    async function loadSessions() {
      setLoading(true)
      try {
        const allSessions = await getAllIdeaSessions()
        // 只显示已完成的会话
        setSessions(allSessions.filter(s => s.status === 'completed'))
      } catch (err) {
        console.error('加载 Idea 会话失败:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSessions()
  }, [refreshTrigger])

  // 删除会话
  const handleDelete = async (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定删除此 Idea 会话？')) return

    try {
      await deleteIdeaSession(sessionId)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
    } catch (err) {
      console.error('删除会话失败:', err)
    }
  }

  // 格式化时间戳
  const formatTimestamp = (timestamp: string) => {
    const parts = timestamp.split('-')
    if (parts.length >= 6) {
      return `${parts[1]}/${parts[2]} ${parts[3]}:${parts[4]}`
    }
    return timestamp
  }

  if (collapsed) return null

  if (loading) {
    return (
      <div className="px-3 py-2 text-sm text-gray-400">
        加载中...
      </div>
    )
  }

  if (sessions.length === 0) {
    return null
  }

  return (
    <div className="border-t border-gray-700 mt-2">
      {/* 标题 */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-3 py-2 cursor-pointer hover:bg-gray-700 flex items-center justify-between"
      >
        <div className="flex items-center">
          <span className="mr-2">{expanded ? '▼' : '▶'}</span>
          <span className="text-sm font-medium text-yellow-400">💡 Idea 历史</span>
          <span className="ml-2 text-xs text-gray-500">({sessions.length})</span>
        </div>
      </div>

      {/* 列表 */}
      {expanded && (
        <div className="pl-4 space-y-1 pb-2">
          {sessions.map(session => (
            <div
              key={session.id}
              onClick={() => onSelectSession(session)}
              className={`px-3 py-2 rounded-lg cursor-pointer transition-colors group ${
                currentSessionId === session.id
                  ? 'bg-yellow-600'
                  : 'hover:bg-gray-700'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium truncate text-sm">
                    {session.groupName}
                  </h4>
                  <p className="text-xs text-gray-400">
                    {formatTimestamp(session.timestamp)}
                  </p>
                </div>

                <button
                  onClick={(e) => handleDelete(session.id!, e)}
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
  )
}
