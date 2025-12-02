/**
 * useIdeaConfig - 工作流配置管理 Hook
 */

import { useState, useEffect, useCallback } from 'react'
import type { IdeaWorkflowConfig, ModelConfig } from '../types/idea'
import {
  getIdeaWorkflowConfig,
  saveIdeaWorkflowConfig,
  getIdeaApiKey,
  saveIdeaApiKey,
  getIdeaApiEndpoint,
  saveIdeaApiEndpoint,
  getAPIKey
} from '../services/storage/db'
import { DEFAULT_ENDPOINTS, PRESET_GENERATORS, PRESET_EVALUATORS, PRESET_SUMMARIZER } from '../types/idea'

/**
 * 配置管理 Hook
 */
export function useIdeaConfig() {
  const [config, setConfig] = useState<IdeaWorkflowConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // API 密钥状态
  const [apiKeys, setApiKeys] = useState<{
    gemini: string
    openai: string
    aliyun: string
  }>({ gemini: '', openai: '', aliyun: '' })

  // API 端点状态
  const [endpoints, setEndpoints] = useState<{
    openai: string
    aliyun: string
    gemini: string
  }>({
    openai: DEFAULT_ENDPOINTS.openai,
    aliyun: DEFAULT_ENDPOINTS.aliyun,
    gemini: DEFAULT_ENDPOINTS.gemini || ''
  })

  // 加载配置
  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const [
        workflowConfig,
        geminiKey,
        openaiKey,
        aliyunKey,
        openaiEndpoint,
        aliyunEndpoint,
        geminiEndpoint
      ] = await Promise.all([
        getIdeaWorkflowConfig(),
        getAPIKey('gemini'),
        getIdeaApiKey('openai'),
        getIdeaApiKey('aliyun'),
        getIdeaApiEndpoint('openai'),
        getIdeaApiEndpoint('aliyun'),
        getIdeaApiEndpoint('gemini')
      ])

      setConfig(workflowConfig)
      setApiKeys({
        gemini: geminiKey || '',
        openai: openaiKey || '',
        aliyun: aliyunKey || ''
      })
      setEndpoints({
        openai: openaiEndpoint,
        aliyun: aliyunEndpoint,
        gemini: geminiEndpoint
      })
    } catch (e) {
      console.error('加载配置失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // 保存配置
  const saveConfig = useCallback(async (newConfig: IdeaWorkflowConfig) => {
    setSaving(true)
    try {
      await saveIdeaWorkflowConfig(newConfig)
      setConfig(newConfig)
    } finally {
      setSaving(false)
    }
  }, [])

  // 保存 API 密钥
  const saveApiKeys = useCallback(async (keys: typeof apiKeys) => {
    setSaving(true)
    try {
      await Promise.all([
        saveIdeaApiKey('openai', keys.openai),
        saveIdeaApiKey('aliyun', keys.aliyun)
      ])
      setApiKeys(keys)
    } finally {
      setSaving(false)
    }
  }, [])

  // 保存 API 端点
  const saveEndpoints = useCallback(async (eps: typeof endpoints) => {
    setSaving(true)
    try {
      await Promise.all([
        saveIdeaApiEndpoint('openai', eps.openai),
        saveIdeaApiEndpoint('aliyun', eps.aliyun),
        saveIdeaApiEndpoint('gemini', eps.gemini)
      ])
      setEndpoints(eps)
    } finally {
      setSaving(false)
    }
  }, [])

  // 更新生成器列表
  const updateGenerators = useCallback(async (generators: ModelConfig[]) => {
    if (!config) return
    const newConfig = { ...config, generators }
    await saveConfig(newConfig)
  }, [config, saveConfig])

  // 更新评审器列表
  const updateEvaluators = useCallback(async (evaluators: ModelConfig[]) => {
    if (!config) return
    const newConfig = { ...config, evaluators }
    await saveConfig(newConfig)
  }, [config, saveConfig])

  // 更新筛选器
  const updateSummarizer = useCallback(async (summarizer: ModelConfig) => {
    if (!config) return
    const newConfig = { ...config, summarizer }
    await saveConfig(newConfig)
  }, [config, saveConfig])

  // 更新提示词
  const updatePrompts = useCallback(async (prompts: IdeaWorkflowConfig['prompts']) => {
    if (!config) return
    const newConfig = { ...config, prompts }
    await saveConfig(newConfig)
  }, [config, saveConfig])

  // 切换模型启用状态
  const toggleModelEnabled = useCallback(async (
    type: 'generators' | 'evaluators',
    modelId: string
  ) => {
    if (!config) return

    const models = config[type].map(m =>
      m.id === modelId ? { ...m, enabled: !m.enabled } : m
    )

    if (type === 'generators') {
      await updateGenerators(models)
    } else {
      await updateEvaluators(models)
    }
  }, [config, updateGenerators, updateEvaluators])

  // 添加自定义模型
  const addCustomModel = useCallback(async (
    type: 'generators' | 'evaluators',
    model: Omit<ModelConfig, 'id' | 'isPreset'>
  ) => {
    if (!config) return

    const newModel: ModelConfig = {
      ...model,
      id: `custom-${Date.now()}`,
      isPreset: false
    }

    const models = [...config[type], newModel]

    if (type === 'generators') {
      await updateGenerators(models)
    } else {
      await updateEvaluators(models)
    }
  }, [config, updateGenerators, updateEvaluators])

  // 删除自定义模型
  const removeCustomModel = useCallback(async (
    type: 'generators' | 'evaluators',
    modelId: string
  ) => {
    if (!config) return

    const models = config[type].filter(m => m.id !== modelId)

    if (type === 'generators') {
      await updateGenerators(models)
    } else {
      await updateEvaluators(models)
    }
  }, [config, updateGenerators, updateEvaluators])

  // 更新模型配置
  const updateModelConfig = useCallback(async (
    type: 'generators' | 'evaluators',
    modelId: string,
    updates: Partial<ModelConfig>
  ) => {
    if (!config) return

    const models = config[type].map(m =>
      m.id === modelId ? { ...m, ...updates } : m
    )

    if (type === 'generators') {
      await updateGenerators(models)
    } else {
      await updateEvaluators(models)
    }
  }, [config, updateGenerators, updateEvaluators])

  // 重置为默认配置
  const resetToDefaults = useCallback(async () => {
    const defaultConfig: IdeaWorkflowConfig = {
      generators: PRESET_GENERATORS,
      evaluators: PRESET_EVALUATORS,
      summarizer: PRESET_SUMMARIZER,
      prompts: {
        generator: '',
        evaluator: '',
        summarizer: ''
      }
    }
    await saveConfig(defaultConfig)
  }, [saveConfig])

  return {
    config,
    loading,
    saving,
    apiKeys,
    endpoints,
    loadConfig,
    saveConfig,
    saveApiKeys,
    saveEndpoints,
    updateGenerators,
    updateEvaluators,
    updateSummarizer,
    updatePrompts,
    toggleModelEnabled,
    addCustomModel,
    removeCustomModel,
    updateModelConfig,
    resetToDefaults
  }
}
