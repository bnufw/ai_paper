/**
 * 跨会话 Idea 综合评估界面
 */

import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import { useCrossSessionEvaluation } from '../../hooks/useCrossSessionEvaluation'
import type { IdeaSession } from '../../types/idea'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function CrossSessionEvaluator({ isOpen, onClose }: Props) {
  const {
    phase,
    selectedIdeas,
    result,
    error,
    progress,
    availableSessions,
    loadingSessions,
    loadSessionIdeasForSelection,
    addSelectedIdea,
    removeSelectedIdea,
    clearSelection,
    runEvaluation,
    isIdeaSelected,
    refreshSessions
  } = useCrossSessionEvaluation()

  const [expandedSession, setExpandedSession] = useState<number | null>(null)
  const [sessionIdeas, setSessionIdeas] = useState<Map<number, {
    bestIdea: string | null
    allIdeas: Map<string, string>
  }>>(new Map())
  const [loadingSession, setLoadingSession] = useState<number | null>(null)

  // 打开时刷新会话列表
  useEffect(() => {
    if (isOpen) {
      refreshSessions()
    }
  }, [isOpen, refreshSessions])

  // 展开会话时加载其 Ideas
  const handleExpandSession = async (sessionId: number) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null)
      return
    }

    setExpandedSession(sessionId)

    if (!sessionIdeas.has(sessionId)) {
      setLoadingSession(sessionId)
      const data = await loadSessionIdeasForSelection(sessionId)
      setSessionIdeas(prev => new Map(prev).set(sessionId, data))
      setLoadingSession(null)
    }
  }

  // 选择 Idea
  const handleSelectIdea = (session: IdeaSession, ideaSlug: string, displayName: string) => {
    const selected = isIdeaSelected(session.id!, ideaSlug)

    if (selected) {
      removeSelectedIdea(session.id!, ideaSlug)
    } else {
      addSelectedIdea({
        sessionId: session.id!,
        sessionTimestamp: session.timestamp,
        groupName: session.groupName,
        ideaSlug,
        content: '',  // 评估时加载
        displayName
      })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[900px] max-h-[85vh] flex flex-col shadow-xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <h2 className="text-lg font-semibold">跨会话 Idea 综合评估</h2>
              <p className="text-sm text-gray-500">从多个历史会话中选择 Ideas 进行比较评估</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 主体内容 */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* 左侧：会话和 Idea 选择器 */}
          <div className="w-[350px] border-r flex flex-col flex-shrink-0">
            <div className="px-4 py-3 bg-gray-50 border-b flex-shrink-0">
              <h3 className="font-medium text-sm text-gray-700">选择要评估的 Ideas</h3>
              <p className="text-xs text-gray-500 mt-1">已选择 {selectedIdeas.length} 个</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingSessions ? (
                <div className="p-4 text-center text-gray-500">
                  <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
                  加载中...
                </div>
              ) : availableSessions.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  暂无已完成的 Idea 会话
                </div>
              ) : (
                availableSessions.map(session => (
                  <div key={session.id} className="border-b">
                    {/* 会话标题 */}
                    <div
                      onClick={() => handleExpandSession(session.id!)}
                      className="px-4 py-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{session.groupName}</div>
                        <div className="text-xs text-gray-400">{session.timestamp}</div>
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${
                          expandedSession === session.id ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {/* 展开的 Ideas 列表 */}
                    {expandedSession === session.id && (
                      <div className="px-4 pb-3 space-y-2">
                        {loadingSession === session.id ? (
                          <div className="text-sm text-gray-500 py-2">加载中...</div>
                        ) : sessionIdeas.has(session.id!) ? (
                          <>
                            {/* Best Idea */}
                            {sessionIdeas.get(session.id!)?.bestIdea && (
                              <IdeaCheckbox
                                label="Best Idea"
                                checked={isIdeaSelected(session.id!, 'best_idea')}
                                onChange={() => handleSelectIdea(session, 'best_idea', 'Best Idea')}
                                highlight
                              />
                            )}

                            {/* 其他 Ideas */}
                            {Array.from(sessionIdeas.get(session.id!)?.allIdeas.keys() || []).map(slug => (
                              <IdeaCheckbox
                                key={slug}
                                label={slug}
                                checked={isIdeaSelected(session.id!, slug)}
                                onChange={() => handleSelectIdea(session, slug, slug)}
                              />
                            ))}
                          </>
                        ) : (
                          <div className="text-sm text-gray-500 py-2">无可用 Ideas</div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* 底部操作 */}
            <div className="px-4 py-3 border-t bg-gray-50 flex gap-2 flex-shrink-0">
              <button
                onClick={clearSelection}
                disabled={selectedIdeas.length === 0}
                className="flex-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                清空选择
              </button>
              <button
                onClick={() => runEvaluation()}
                disabled={selectedIdeas.length < 2 || phase === 'evaluating'}
                className="flex-1 px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {phase === 'evaluating' ? '评估中...' : '开始评估'}
              </button>
            </div>
          </div>

          {/* 右侧：评估结果 */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {phase === 'idle' && selectedIdeas.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <p className="text-lg mb-2">👈 从左侧选择 Ideas</p>
                  <p className="text-sm">至少选择 2 个 Idea 进行综合评估</p>
                </div>
              </div>
            )}

            {(phase === 'idle' || phase === 'selecting') && selectedIdeas.length > 0 && !result && (
              <div className="flex-1 p-4 overflow-y-auto">
                <h4 className="font-medium mb-3">已选择的 Ideas:</h4>
                <div className="space-y-2">
                  {selectedIdeas.map((idea, idx) => (
                    <div
                      key={`${idea.sessionId}_${idea.ideaSlug}`}
                      className="flex items-center justify-between p-3 bg-blue-50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{idx + 1}. {idea.displayName}</span>
                        <span className="text-sm text-gray-500 ml-2">({idea.groupName})</span>
                      </div>
                      <button
                        onClick={() => removeSelectedIdea(idea.sessionId, idea.ideaSlug)}
                        className="text-red-500 hover:text-red-700 ml-2 flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {phase === 'evaluating' && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-gray-600">{progress || '正在评估...'}</p>
                </div>
              </div>
            )}

            {phase === 'completed' && result && (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {result.analysis}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {phase === 'failed' && error && (
              <div className="flex-1 p-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  <div className="font-medium mb-1">评估失败</div>
                  <div className="text-sm">{error}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// 辅助组件：Idea 复选框
function IdeaCheckbox({
  label,
  checked,
  onChange,
  highlight = false
}: {
  label: string
  checked: boolean
  onChange: () => void
  highlight?: boolean
}) {
  return (
    <label
      className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-100 ${
        highlight ? 'bg-yellow-50' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
      />
      <span className={`text-sm ${highlight ? 'font-medium text-yellow-700' : ''}`}>
        {highlight && '🏆 '}{label}
      </span>
    </label>
  )
}
