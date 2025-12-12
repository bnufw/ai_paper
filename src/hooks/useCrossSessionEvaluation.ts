/**
 * 跨会话 Idea 评估 Hook
 */

import { useState, useCallback, useEffect } from 'react'
import type {
  SelectedIdea,
  CrossSessionEvaluationState,
  CrossSessionEvaluationPhase,
  IdeaSession
} from '../types/idea'
import {
  getAvailableSessions,
  loadSessionIdeas,
  evaluateCrossSessionIdeas
} from '../services/idea/crossSessionService'

export function useCrossSessionEvaluation() {
  const [state, setState] = useState<CrossSessionEvaluationState>({
    phase: 'idle',
    selectedIdeas: [],
    result: null,
    error: null,
    progress: ''
  })

  const [availableSessions, setAvailableSessions] = useState<IdeaSession[]>([])
  const [sessionIdeasCache, setSessionIdeasCache] = useState<Map<number, {
    bestIdea: string | null
    allIdeas: Map<string, string>
  }>>(new Map())
  const [loadingSessions, setLoadingSessions] = useState(false)

  // 加载可用会话
  const refreshSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const sessions = await getAvailableSessions()
      setAvailableSessions(sessions)
    } catch (err) {
      console.error('加载会话列表失败:', err)
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  // 初始加载
  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  // 加载会话的 Ideas（用于选择器）
  const loadSessionIdeasForSelection = useCallback(async (sessionId: number) => {
    if (sessionIdeasCache.has(sessionId)) {
      return sessionIdeasCache.get(sessionId)!
    }

    const session = availableSessions.find(s => s.id === sessionId)
    if (!session) return { bestIdea: null, allIdeas: new Map<string, string>() }

    try {
      const data = await loadSessionIdeas(session)
      setSessionIdeasCache(prev => new Map(prev).set(sessionId, data))
      return data
    } catch (err) {
      console.error('加载会话 Ideas 失败:', err)
      return { bestIdea: null, allIdeas: new Map<string, string>() }
    }
  }, [availableSessions, sessionIdeasCache])

  // 添加选中的 Idea
  const addSelectedIdea = useCallback((idea: SelectedIdea) => {
    setState(prev => {
      // 检查是否已存在
      const exists = prev.selectedIdeas.some(
        i => i.sessionId === idea.sessionId && i.ideaSlug === idea.ideaSlug
      )
      if (exists) return prev

      return {
        ...prev,
        selectedIdeas: [...prev.selectedIdeas, idea],
        phase: 'selecting' as CrossSessionEvaluationPhase
      }
    })
  }, [])

  // 移除选中的 Idea
  const removeSelectedIdea = useCallback((sessionId: number, ideaSlug: string) => {
    setState(prev => {
      const newSelected = prev.selectedIdeas.filter(
        i => !(i.sessionId === sessionId && i.ideaSlug === ideaSlug)
      )
      return {
        ...prev,
        selectedIdeas: newSelected,
        phase: newSelected.length === 0 ? 'idle' : 'selecting'
      }
    })
  }, [])

  // 清空选择
  const clearSelection = useCallback(() => {
    setState({
      phase: 'idle',
      selectedIdeas: [],
      result: null,
      error: null,
      progress: ''
    })
  }, [])

  // 执行评估
  const runEvaluation = useCallback(async (customPrompt?: string) => {
    if (state.selectedIdeas.length < 2) {
      setState(prev => ({ ...prev, error: '请至少选择 2 个 Idea' }))
      return
    }

    setState(prev => ({
      ...prev,
      phase: 'evaluating',
      error: null,
      progress: '开始评估...'
    }))

    try {
      const result = await evaluateCrossSessionIdeas(
        state.selectedIdeas,
        customPrompt,
        (msg) => setState(prev => ({ ...prev, progress: msg }))
      )

      setState(prev => ({
        ...prev,
        phase: 'completed',
        result,
        progress: '评估完成'
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        phase: 'failed',
        error: (err as Error).message,
        progress: ''
      }))
    }
  }, [state.selectedIdeas])

  // 检查 Idea 是否已选中
  const isIdeaSelected = useCallback((sessionId: number, ideaSlug: string) => {
    return state.selectedIdeas.some(
      i => i.sessionId === sessionId && i.ideaSlug === ideaSlug
    )
  }, [state.selectedIdeas])

  return {
    ...state,
    availableSessions,
    loadingSessions,
    loadSessionIdeasForSelection,
    addSelectedIdea,
    removeSelectedIdea,
    clearSelection,
    runEvaluation,
    isIdeaSelected,
    refreshSessions
  }
}
