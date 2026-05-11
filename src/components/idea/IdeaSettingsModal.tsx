/**
 * Idea 设置弹窗
 * 包含：API 密钥、生成器、评审器、筛选器、提示词配置
 */

import { useState, useEffect } from 'react'
import { useIdeaConfig } from '../../hooks/useIdeaConfig'
import type { ModelConfig } from '../../types/idea'
import { DEFAULT_GENERATOR_PROMPT, DEFAULT_EVALUATOR_PROMPT, DEFAULT_SUMMARIZER_PROMPT } from '../../services/idea'

interface Props {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'idea' | 'api' | 'generators' | 'evaluators' | 'summarizer' | 'prompts'

export function IdeaSettingsModal({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('idea')
  const {
    config,
    loading,
    saving,
    apiKeys,
    endpoints,
    saveApiKeys,
    saveEndpoints,
    toggleModelEnabled,
    updateModelConfig,
    updatePrompts,
    updateUserIdea,
    updateSummarizer,
    resetToDefaults
  } = useIdeaConfig()

  // 本地编辑状态 - 初始化为空，等待数据加载后同步
  const [localApiKeys, setLocalApiKeys] = useState({ gemini: '', openai: '', aliyun: '' })
  const [localEndpoints, setLocalEndpoints] = useState({ openai: '', aliyun: '' })
  const [localPrompts, setLocalPrompts] = useState({ generator: '', evaluator: '', summarizer: '' })
  const [localUserIdea, setLocalUserIdea] = useState('')

  // 密钥显示/隐藏状态
  const [showKeys, setShowKeys] = useState({ openai: false, aliyun: false })

  // 当外部数据加载完成后，同步到本地状态（仅在首次加载时）
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!loading && !initialized) {
      setLocalApiKeys({
        gemini: apiKeys.gemini,
        openai: apiKeys.openai,
        aliyun: apiKeys.aliyun
      })
      setLocalEndpoints({
        openai: endpoints.openai,
        aliyun: endpoints.aliyun
      })
      if (config?.prompts) {
        setLocalPrompts({
          generator: config.prompts.generator || DEFAULT_GENERATOR_PROMPT,
          evaluator: config.prompts.evaluator || DEFAULT_EVALUATOR_PROMPT,
          summarizer: config.prompts.summarizer || DEFAULT_SUMMARIZER_PROMPT
        })
      } else {
        setLocalPrompts({
          generator: DEFAULT_GENERATOR_PROMPT,
          evaluator: DEFAULT_EVALUATOR_PROMPT,
          summarizer: DEFAULT_SUMMARIZER_PROMPT
        })
      }
      setLocalUserIdea(config?.userIdea || '')
      setInitialized(true)
    }
  }, [loading, initialized, apiKeys, endpoints, config?.prompts, config?.userIdea])

  // 弹窗关闭时重置状态，下次打开重新加载
  useEffect(() => {
    if (!isOpen) {
      setInitialized(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </div>
    )
  }

  const handleSaveApiKeys = async () => {
    await saveApiKeys(localApiKeys)
  }

  const handleSaveEndpoints = async () => {
    await saveEndpoints(localEndpoints)
  }

  const handleSavePrompts = async () => {
    await updatePrompts(localPrompts)
  }

  const handleSaveUserIdea = async () => {
    await updateUserIdea(localUserIdea)
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'idea', label: '研究方向' },
    { key: 'api', label: 'API 密钥' },
    { key: 'generators', label: '生成器' },
    { key: 'evaluators', label: '评审器' },
    { key: 'summarizer', label: '筛选器' },
    { key: 'prompts', label: '提示词' }
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[800px] max-h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Idea 工作流设置</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 标签页 */}
        <div className="flex border-b px-4">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 研究方向 */}
          {activeTab === 'idea' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700">研究方向</h3>
                <p className="text-sm text-gray-500 mt-1">
                  描述你的研究兴趣、想探索的问题或粗略的 idea，生成器将围绕此方向构思
                </p>
              </div>
              <textarea
                value={localUserIdea}
                onChange={e => setLocalUserIdea(e.target.value)}
                className="w-full h-48 px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                placeholder={"例如：\n- 如何提升视觉语言模型在长文档理解上的效果？\n- 探索 xxx 与 xxx 的结合可能性\n- 现有方法在 xxx 场景下存在 xxx 问题，希望找到解决方案"}
              />
              <button
                onClick={handleSaveUserIdea}
                disabled={saving}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                保存
              </button>
            </div>
          )}

          {/* API 密钥 */}
          {activeTab === 'api' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">API 密钥</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Gemini API Key <span className="text-gray-400">(使用全局配置)</span>
                    </label>
                    <input
                      type="password"
                      value={localApiKeys.gemini ? '••••••••••••••••' : ''}
                      disabled
                      className="w-full px-3 py-2 border rounded-md bg-gray-50 text-gray-500"
                      placeholder="在全局设置中配置"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      OpenAI 兼容端点 API Key <span className="text-gray-400">(Claude/GPT/o4)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKeys.openai ? 'text' : 'password'}
                        value={localApiKeys.openai}
                        onChange={e => setLocalApiKeys({ ...localApiKeys, openai: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                        placeholder="输入 API Key"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeys({ ...showKeys, openai: !showKeys.openai })}
                        className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                      >
                        {showKeys.openai ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      阿里云 API Key <span className="text-gray-400">(Qwen)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKeys.aliyun ? 'text' : 'password'}
                        value={localApiKeys.aliyun}
                        onChange={e => setLocalApiKeys({ ...localApiKeys, aliyun: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                        placeholder="输入 API Key"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeys({ ...showKeys, aliyun: !showKeys.aliyun })}
                        className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                      >
                        {showKeys.aliyun ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">API 端点</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">OpenAI 兼容端点</label>
                    <input
                      type="text"
                      value={localEndpoints.openai}
                      onChange={e => setLocalEndpoints({ ...localEndpoints, openai: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">阿里云端点</label>
                    <input
                      type="text"
                      value={localEndpoints.aliyun}
                      onChange={e => setLocalEndpoints({ ...localEndpoints, aliyun: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveApiKeys}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  保存密钥
                </button>
                <button
                  onClick={handleSaveEndpoints}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  保存端点
                </button>
              </div>
            </div>
          )}

          {/* 生成器配置 */}
          {activeTab === 'generators' && config && (
            <ModelListConfig
              title="生成器模型"
              description="用于生成创新 Idea 的模型，支持并发调用多个模型"
              models={config.generators}
              onToggle={(id) => toggleModelEnabled('generators', id)}
              onUpdate={(id, updates) => updateModelConfig('generators', id, updates)}
            />
          )}

          {/* 评审器配置 */}
          {activeTab === 'evaluators' && config && (
            <ModelListConfig
              title="评审器模型"
              description="用于评审所有 Idea 并给出排名的模型"
              models={config.evaluators}
              onToggle={(id) => toggleModelEnabled('evaluators', id)}
              onUpdate={(id, updates) => updateModelConfig('evaluators', id, updates)}
            />
          )}

          {/* 筛选器配置 */}
          {activeTab === 'summarizer' && config && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700">筛选器模型</h3>
                <p className="text-sm text-gray-500 mt-1">综合所有评审意见，选出最佳 Idea</p>
              </div>
              <ModelCard
                model={config.summarizer}
                showToggle={false}
                onUpdate={(updates) => updateSummarizer({
                  ...config.summarizer,
                  ...updates,
                  thinkingConfig: updates.thinkingConfig
                    ? { ...config.summarizer.thinkingConfig, ...updates.thinkingConfig }
                    : config.summarizer.thinkingConfig
                })}
              />
            </div>
          )}

          {/* 提示词配置 */}
          {activeTab === 'prompts' && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    生成器提示词
                  </label>
                  <button
                    onClick={() => setLocalPrompts({ ...localPrompts, generator: DEFAULT_GENERATOR_PROMPT })}
                    className="text-xs text-blue-500 hover:text-blue-600"
                  >
                    重置为默认
                  </button>
                </div>
                <textarea
                  value={localPrompts.generator}
                  onChange={e => setLocalPrompts({ ...localPrompts, generator: e.target.value })}
                  className="w-full h-40 px-3 py-2 border rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    评审器提示词
                  </label>
                  <button
                    onClick={() => setLocalPrompts({ ...localPrompts, evaluator: DEFAULT_EVALUATOR_PROMPT })}
                    className="text-xs text-blue-500 hover:text-blue-600"
                  >
                    重置为默认
                  </button>
                </div>
                <textarea
                  value={localPrompts.evaluator}
                  onChange={e => setLocalPrompts({ ...localPrompts, evaluator: e.target.value })}
                  className="w-full h-40 px-3 py-2 border rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    筛选器提示词
                  </label>
                  <button
                    onClick={() => setLocalPrompts({ ...localPrompts, summarizer: DEFAULT_SUMMARIZER_PROMPT })}
                    className="text-xs text-blue-500 hover:text-blue-600"
                  >
                    重置为默认
                  </button>
                </div>
                <textarea
                  value={localPrompts.summarizer}
                  onChange={e => setLocalPrompts({ ...localPrompts, summarizer: e.target.value })}
                  className="w-full h-40 px-3 py-2 border rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <button
                onClick={handleSavePrompts}
                disabled={saving}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                保存提示词
              </button>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex justify-between items-center px-6 py-4 border-t bg-gray-50">
          <button
            onClick={async () => {
              await resetToDefaults()
              setInitialized(false)
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            重置为默认配置
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

// 模型列表配置组件
function ModelListConfig({
  title,
  description,
  models,
  onToggle,
  onUpdate
}: {
  title: string
  description: string
  models: ModelConfig[]
  onToggle: (id: string) => void
  onUpdate: (id: string, updates: Partial<ModelConfig>) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>
      <div className="space-y-3">
        {models.map(model => (
          <ModelCard
            key={model.id}
            model={model}
            onToggle={() => onToggle(model.id)}
            onUpdate={(updates) => onUpdate(model.id, updates)}
          />
        ))}
      </div>
    </div>
  )
}

// 单个模型配置卡片
function ModelCard({
  model,
  showToggle = true,
  onToggle,
  onUpdate
}: {
  model: ModelConfig
  showToggle?: boolean
  onToggle?: () => void
  onUpdate: (updates: Partial<ModelConfig>) => void
}) {
  const [expanded, setExpanded] = useState(false)
  type NumberInputKey = 'temperature' | 'maxTokens' | 'thinkingBudget' | 'budgetTokens'

  const formatNumberInput = (value?: number) => value === undefined ? '' : String(value)
  const getNumberInputs = (source: ModelConfig) => ({
    temperature: formatNumberInput(source.temperature),
    maxTokens: formatNumberInput(source.maxTokens),
    thinkingBudget: formatNumberInput(source.thinkingConfig?.thinkingBudget),
    budgetTokens: formatNumberInput(source.thinkingConfig?.budgetTokens)
  })

  // 本地状态管理输入框的值
  const [localConfig, setLocalConfig] = useState({
    temperature: model.temperature,
    maxTokens: model.maxTokens,
    thinkingBudget: model.thinkingConfig?.thinkingBudget,
    thinkingLevel: model.thinkingConfig?.thinkingLevel,
    budgetTokens: model.thinkingConfig?.budgetTokens,
    reasoningEffort: model.thinkingConfig?.reasoningEffort,
    verbosity: model.thinkingConfig?.verbosity,
    enableThinking: model.thinkingConfig?.enableThinking,
    thinkingType: model.thinkingConfig?.thinkingType
  })
  const [numberInputs, setNumberInputs] = useState(getNumberInputs(model))
  const [activeNumberInput, setActiveNumberInput] = useState<NumberInputKey | null>(null)

  // 同步外部数据到本地状态
  useEffect(() => {
    setLocalConfig({
      temperature: model.temperature,
      maxTokens: model.maxTokens,
      thinkingBudget: model.thinkingConfig?.thinkingBudget,
      thinkingLevel: model.thinkingConfig?.thinkingLevel,
      budgetTokens: model.thinkingConfig?.budgetTokens,
      reasoningEffort: model.thinkingConfig?.reasoningEffort,
      verbosity: model.thinkingConfig?.verbosity,
      enableThinking: model.thinkingConfig?.enableThinking,
      thinkingType: model.thinkingConfig?.thinkingType
    })
    if (!activeNumberInput) {
      setNumberInputs(getNumberInputs(model))
    }
  }, [model])

  const parseOptionalFloat = (value: string) => {
    const trimmed = value.trim()
    if (trimmed === '') return undefined

    const parsed = parseFloat(trimmed)
    return Number.isNaN(parsed) ? undefined : parsed
  }

  const parseOptionalInt = (value: string) => {
    const trimmed = value.trim()
    if (trimmed === '') return undefined

    const parsed = parseInt(trimmed, 10)
    return Number.isNaN(parsed) ? undefined : parsed
  }

  return (
    <div className={`border rounded-lg p-4 ${model.enabled ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {showToggle && (
            <button
              onClick={onToggle}
              className={`w-10 h-5 rounded-full transition-colors ${
                model.enabled ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                model.enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{model.slug}</span>
              {model.isPreset && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">预设</span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {model.provider} / {model.model}
            </div>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg
            className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Temperature</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={numberInputs.temperature}
                onFocus={() => setActiveNumberInput('temperature')}
                onChange={e => setNumberInputs(prev => ({ ...prev, temperature: e.target.value }))}
                onBlur={() => {
                  const val = parseOptionalFloat(numberInputs.temperature)
                  setActiveNumberInput(null)
                  setLocalConfig(prev => ({ ...prev, temperature: val }))
                  onUpdate({ temperature: val })
                }}
                className="w-full px-2 py-1 border rounded text-sm text-gray-900"
                placeholder="默认"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {model.provider === 'google'
                  ? 'Max Output Tokens'
                  : model.provider === 'openai' && (model.model.includes('gpt-5') || model.model.includes('o3') || model.model.includes('o4'))
                    ? 'Max Completion Tokens'
                    : 'Max Tokens'}
              </label>
              <input
                type="number"
                step="1000"
                min="1000"
                value={numberInputs.maxTokens}
                onFocus={() => setActiveNumberInput('maxTokens')}
                onChange={e => setNumberInputs(prev => ({ ...prev, maxTokens: e.target.value }))}
                onBlur={() => {
                  const val = parseOptionalInt(numberInputs.maxTokens)
                  setActiveNumberInput(null)
                  setLocalConfig(prev => ({ ...prev, maxTokens: val }))
                  onUpdate({ maxTokens: val })
                }}
                className="w-full px-2 py-1 border rounded text-sm text-gray-900"
                placeholder="默认"
              />
            </div>
          </div>

          {/* 思考模式参数 */}
          {model.provider === 'google' && model.model.includes('gemini-3') && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Thinking Level</label>
              <select
                value={localConfig.thinkingLevel || 'low'}
                onChange={e => {
                  const val = e.target.value as 'low' | 'high'
                  setLocalConfig(prev => ({ ...prev, thinkingLevel: val }))
                  onUpdate({
                    thinkingConfig: {
                      thinkingLevel: val
                    }
                  })
                }}
                className="w-full px-2 py-1 border rounded text-sm text-gray-900"
              >
                <option value="low">Low</option>
                <option value="high">High</option>
              </select>
            </div>
          )}

          {model.provider === 'google' && !model.model.includes('gemini-3') && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Thinking Budget</label>
              <input
                type="number"
                step="1000"
                value={numberInputs.thinkingBudget}
                onFocus={() => setActiveNumberInput('thinkingBudget')}
                onChange={e => setNumberInputs(prev => ({ ...prev, thinkingBudget: e.target.value }))}
                onBlur={() => {
                  const val = parseOptionalInt(numberInputs.thinkingBudget)
                  setActiveNumberInput(null)
                  setLocalConfig(prev => ({ ...prev, thinkingBudget: val }))
                  onUpdate({
                    thinkingConfig: {
                      thinkingBudget: val
                    }
                  })
                }}
                className="w-full px-2 py-1 border rounded text-sm text-gray-900"
                placeholder="-1 为动态，0 为禁用"
              />
            </div>
          )}

          {model.provider === 'openai' && model.model.includes('claude') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Thinking Type</label>
                <select
                  value={localConfig.thinkingType || 'disabled'}
                  onChange={e => {
                    const val = e.target.value as 'enabled' | 'disabled'
                    setLocalConfig(prev => ({ ...prev, thinkingType: val }))
                    onUpdate({
                      thinkingConfig: {
                        thinkingType: val
                      }
                    })
                  }}
                  className="w-full px-2 py-1 border rounded text-sm text-gray-900"
                >
                  <option value="enabled">启用</option>
                  <option value="disabled">禁用</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Budget Tokens</label>
                <input
                  type="number"
                  step="500"
                  value={numberInputs.budgetTokens}
                  onFocus={() => setActiveNumberInput('budgetTokens')}
                  onChange={e => setNumberInputs(prev => ({ ...prev, budgetTokens: e.target.value }))}
                  onBlur={() => {
                    const val = parseOptionalInt(numberInputs.budgetTokens)
                    setActiveNumberInput(null)
                    setLocalConfig(prev => ({ ...prev, budgetTokens: val }))
                    onUpdate({
                      thinkingConfig: {
                        budgetTokens: val
                      }
                    })
                  }}
                  className="w-full px-2 py-1 border rounded text-sm text-gray-900"
                  placeholder="默认 3500"
                />
              </div>
            </div>
          )}

          {model.provider === 'openai' && model.model.includes('gpt-5') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Reasoning Effort</label>
                <select
                  value={localConfig.reasoningEffort || 'low'}
                  onChange={e => {
                    const val = e.target.value as 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
                    setLocalConfig(prev => ({ ...prev, reasoningEffort: val }))
                    onUpdate({
                      thinkingConfig: {
                        reasoningEffort: val
                      }
                    })
                  }}
                  className="w-full px-2 py-1 border rounded text-sm text-gray-900"
                >
                  <option value="minimal">Minimal</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  {model.model === 'gpt-5.2' && <option value="xhigh">XHigh</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Verbosity</label>
                <select
                  value={localConfig.verbosity ?? ''}
                  onChange={e => {
                    const val = e.target.value as 'low' | 'medium' | 'high' | ''
                    const verbosity = val === '' ? undefined : val
                    setLocalConfig(prev => ({ ...prev, verbosity }))
                    onUpdate({
                      thinkingConfig: {
                        verbosity
                      }
                    })
                  }}
                  className="w-full px-2 py-1 border rounded text-sm text-gray-900"
                >
                  <option value="">Auto</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          )}

          {model.provider === 'openai' && (model.model.includes('o3') || model.model.includes('o4')) && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Reasoning Effort</label>
              <select
                value={localConfig.reasoningEffort || 'low'}
                onChange={e => {
                  const val = e.target.value as 'low' | 'medium' | 'high'
                  setLocalConfig(prev => ({ ...prev, reasoningEffort: val }))
                  onUpdate({
                    thinkingConfig: {
                      reasoningEffort: val
                    }
                  })
                }}
                className="w-full px-2 py-1 border rounded text-sm text-gray-900"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          )}

          {model.provider === 'aliyun' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`thinking-${model.id}`}
                checked={localConfig.enableThinking ?? false}
                onChange={e => {
                  const val = e.target.checked
                  setLocalConfig(prev => ({ ...prev, enableThinking: val }))
                  onUpdate({
                    thinkingConfig: {
                      enableThinking: val
                    }
                  })
                }}
                className="rounded"
              />
              <label htmlFor={`thinking-${model.id}`} className="text-sm text-gray-600">
                启用思考模式
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
