/**
 * useIdeaWorkflow - 工作流状态管理 Hook
 */

import { useState, useEffect, useCallback } from 'react'
import type { WorkflowState } from '../types/idea'
import { workflowEngine } from '../services/idea'

/**
 * 工作流状态管理 Hook
 */
export function useIdeaWorkflow() {
  const [state, setState] = useState<WorkflowState>(workflowEngine.getState())
  const [isRunning, setIsRunning] = useState(false)

  // 订阅状态变化
  useEffect(() => {
    const unsubscribe = workflowEngine.subscribe((newState) => {
      setState(newState)
      setIsRunning(
        newState.phase === 'preparing' ||
        newState.phase === 'generating' ||
        newState.phase === 'evaluating' ||
        newState.phase === 'summarizing'
      )
    })

    return unsubscribe
  }, [])

  // 启动工作流
  const start = useCallback(async (groupId: number) => {
    setIsRunning(true)
    await workflowEngine.run(groupId)
  }, [])

  // 取消工作流
  const cancel = useCallback(() => {
    workflowEngine.cancel()
  }, [])

  // 重置状态
  const reset = useCallback(() => {
    workflowEngine.reset()
  }, [])

  // 计算各阶段完成数量
  const getStageStats = useCallback(() => {
    const generators = Array.from(state.generators.values())
    const evaluators = Array.from(state.evaluators.values())

    return {
      generators: {
        total: generators.length,
        completed: generators.filter(g => g.status === 'completed').length,
        failed: generators.filter(g => g.status === 'failed').length,
        running: generators.filter(g => g.status === 'running').length
      },
      evaluators: {
        total: evaluators.length,
        completed: evaluators.filter(e => e.status === 'completed').length,
        failed: evaluators.filter(e => e.status === 'failed').length,
        running: evaluators.filter(e => e.status === 'running').length
      },
      summarizer: state.summarizer.status
    }
  }, [state])

  return {
    state,
    isRunning,
    start,
    cancel,
    reset,
    getStageStats
  }
}
