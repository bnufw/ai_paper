/**
 * Idea 工作流执行界面
 * 实时显示工作流执行状态
 */

import { useEffect, useRef, useState } from 'react'
import { useIdeaWorkflow } from '../../hooks/useIdeaWorkflow'
import type { ModelTaskState, WorkflowPhase } from '../../types/idea'

interface Props {
  isOpen: boolean
  groupId: number
  groupName: string
  onComplete?: () => void
  onOpenSession?: (sessionId: number) => void
  onClose: () => void
}

export function IdeaWorkflowRunner({ isOpen, groupId, groupName, onComplete, onOpenSession, onClose }: Props) {
  const { state, isRunning, start, cancel, reset, getStageStats } = useIdeaWorkflow()
  const [, setTick] = useState(0)  // 用于强制刷新计时
  const notifiedSessionIdRef = useRef<number | null>(null)

  // 打开时自动开始
  useEffect(() => {
    if (isOpen && state.phase === 'idle') {
      notifiedSessionIdRef.current = null
      start(groupId)
    }
  }, [isOpen, groupId, state.phase, start])

  // 完成时通知父级刷新历史列表
  useEffect(() => {
    if (!isOpen || state.phase !== 'completed' || !state.sessionId) return
    if (notifiedSessionIdRef.current === state.sessionId) return

    notifiedSessionIdRef.current = state.sessionId
    onComplete?.()
  }, [isOpen, state.phase, state.sessionId, onComplete])

  // 计时器：运行中时每秒刷新
  useEffect(() => {
    if (!isRunning) return
    const timer = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(timer)
  }, [isRunning])

  // 关闭时重置
  const handleClose = () => {
    if (isRunning) {
      cancel()
    }
    reset()
    onClose()
  }

  if (!isOpen) return null

  const stats = getStageStats()
  const phaseLabels: Record<WorkflowPhase, string> = {
    idle: '准备中',
    preparing: '准备中',
    generating: '生成 Idea',
    evaluating: '评审 Idea',
    summarizing: '筛选最佳',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[700px] max-h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚀</span>
            <div>
              <h2 className="text-lg font-semibold">生成研究 Idea</h2>
              <p className="text-sm text-gray-500">{groupName}</p>
            </div>
          </div>
          {isRunning ? (
            <button
              onClick={cancel}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md"
            >
              取消
            </button>
          ) : (
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 阶段进度 */}
        <div className="px-6 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-4">
            <PhaseIndicator
              phase="generating"
              label="生成"
              currentPhase={state.phase}
              stats={`${stats.generators.completed}/${stats.generators.total}`}
            />
            <div className="flex-1 h-0.5 bg-gray-200">
              <div
                className={`h-full bg-blue-500 transition-all ${
                  state.phase === 'evaluating' || state.phase === 'summarizing' || state.phase === 'completed'
                    ? 'w-full'
                    : 'w-0'
                }`}
              />
            </div>
            <PhaseIndicator
              phase="evaluating"
              label="评审"
              currentPhase={state.phase}
              stats={`${stats.evaluators.completed}/${stats.evaluators.total}`}
            />
            <div className="flex-1 h-0.5 bg-gray-200">
              <div
                className={`h-full bg-blue-500 transition-all ${
                  state.phase === 'summarizing' || state.phase === 'completed'
                    ? 'w-full'
                    : 'w-0'
                }`}
              />
            </div>
            <PhaseIndicator
              phase="summarizing"
              label="筛选"
              currentPhase={state.phase}
              stats={stats.summarizer === 'completed' ? '✓' : ''}
            />
          </div>
          <div className="mt-3 text-sm text-gray-600 text-center">
            {state.progress.description || phaseLabels[state.phase]}
          </div>
        </div>

        {/* 模型状态网格 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 生成器状态 */}
          {(state.phase === 'generating' || state.phase === 'preparing' ||
            state.phase === 'evaluating' || state.phase === 'summarizing' || state.phase === 'completed') && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">生成器</h3>
              <div className="grid grid-cols-3 gap-3">
                {Array.from(state.generators.entries()).map(([slug, task]) => (
                  <ModelStatusCard key={slug} slug={slug} task={task} />
                ))}
              </div>
            </div>
          )}

          {/* 评审器状态 */}
          {(state.phase === 'evaluating' || state.phase === 'summarizing' || state.phase === 'completed') && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">评审器</h3>
              <div className="grid grid-cols-3 gap-3">
                {Array.from(state.evaluators.entries()).map(([slug, task]) => (
                  <ModelStatusCard key={slug} slug={slug} task={task} />
                ))}
              </div>
            </div>
          )}

          {/* 筛选器状态 */}
          {(state.phase === 'summarizing' || state.phase === 'completed') && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">筛选器</h3>
              <ModelStatusCard slug="Summarizer" task={state.summarizer} />
            </div>
          )}

          {/* 错误信息 */}
          {state.phase === 'failed' && state.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              <div className="font-medium mb-1">工作流失败</div>
              <div className="text-sm">{state.error}</div>
            </div>
          )}

          {/* 完成信息 */}
          {state.phase === 'completed' && state.bestIdea && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                工作流完成
              </div>
              <div className="text-sm text-green-600">
                最佳 Idea 已保存至：{groupName}/ideas/{state.sessionId && `会话 #${state.sessionId}`}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          {state.phase === 'completed' || state.phase === 'failed' || state.phase === 'cancelled' ? (
            <>
              {state.phase === 'completed' && state.sessionId && onOpenSession && (
                <button
                  onClick={() => onOpenSession(state.sessionId!)}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  查看结果
                </button>
              )}
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                关闭
              </button>
            </>
          ) : (
            <button
              onClick={cancel}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              取消
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// 阶段指示器
function PhaseIndicator({
  phase,
  label,
  currentPhase,
  stats
}: {
  phase: WorkflowPhase
  label: string
  currentPhase: WorkflowPhase
  stats?: string
}) {
  const phaseOrder = ['idle', 'preparing', 'generating', 'evaluating', 'summarizing', 'completed']
  const currentIndex = phaseOrder.indexOf(currentPhase)
  const phaseIndex = phaseOrder.indexOf(phase)

  const isActive = currentPhase === phase
  const isCompleted = currentIndex > phaseIndex || currentPhase === 'completed'

  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
          isActive
            ? 'bg-blue-500 text-white animate-pulse'
            : isCompleted
            ? 'bg-green-500 text-white'
            : 'bg-gray-200 text-gray-500'
        }`}
      >
        {isCompleted && !isActive ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          stats || '○'
        )}
      </div>
      <span className={`text-xs mt-1 ${isActive ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
        {label}
      </span>
    </div>
  )
}

// 模型状态卡片
function ModelStatusCard({ slug, task }: { slug: string; task: ModelTaskState }) {
  const statusConfig = {
    pending: { bg: 'bg-gray-100', text: 'text-gray-500', icon: '○', label: '等待' },
    running: { bg: 'bg-blue-50', text: 'text-blue-600', icon: '⏳', label: '运行中' },
    completed: { bg: 'bg-green-50', text: 'text-green-600', icon: '✓', label: '完成' },
    failed: { bg: 'bg-red-50', text: 'text-red-600', icon: '✗', label: '失败' },
    skipped: { bg: 'bg-gray-100', text: 'text-gray-400', icon: '—', label: '跳过' }
  }

  const config = statusConfig[task.status]

  // 计算耗时
  let duration = ''
  if (task.startTime) {
    const endTime = task.endTime || new Date()
    const seconds = Math.round((endTime.getTime() - task.startTime.getTime()) / 1000)
    duration = task.status === 'running' ? `${seconds}s...` : `${seconds}s`
  }

  return (
    <div className={`rounded-lg p-3 ${config.bg}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm truncate">{slug}</span>
        <span className={`text-lg ${config.text}`}>{config.icon}</span>
      </div>
      <div className={`text-xs mt-1 ${config.text}`}>
        {config.label}
        {duration && <span className="ml-1">({duration})</span>}
      </div>
      {task.error && (
        <div className="text-xs text-red-500 mt-1 truncate" title={task.error}>
          {task.error}
        </div>
      )}
    </div>
  )
}
