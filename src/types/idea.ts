/**
 * AI2Idea 工作流类型定义
 */

// ========== 模型提供商 ==========

export type ModelProvider = 'google' | 'openai' | 'aliyun'

// ========== 模型配置 ==========

export interface ModelConfig {
  id: string                    // 唯一标识
  slug: string                  // 显示名称
  provider: ModelProvider
  model: string                 // 模型名称
  enabled: boolean              // 是否启用
  isPreset: boolean             // 是否预设模型
  // 通用参数
  temperature?: number
  maxTokens?: number
  // 思考模式参数
  thinkingConfig?: ThinkingConfig
}

// 思考模式配置（各提供商不同）
export interface ThinkingConfig {
  // Gemini 2.5 Pro: thinkingBudget (0-32768, -1=动态)
  thinkingBudget?: number
  includeThoughts?: boolean
  // Gemini 3 Pro: thinkingLevel (low, high)
  thinkingLevel?: 'low' | 'high'
  // OpenAI GPT-5: reasoningEffort + verbosity
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'none'
  verbosity?: 'low' | 'medium' | 'high'
  // Anthropic Claude: thinking.type + budget_tokens
  thinkingType?: 'enabled' | 'disabled'
  budgetTokens?: number
  // Aliyun Qwen: enableThinking
  enableThinking?: boolean
}

// ========== 工作流配置 ==========

export interface IdeaWorkflowConfig {
  generators: ModelConfig[]     // 生成器模型列表
  evaluators: ModelConfig[]     // 评审器模型列表
  summarizer: ModelConfig       // 筛选器模型
  prompts: {
    generator: string           // 生成提示词
    evaluator: string           // 评审提示词
    summarizer: string          // 筛选提示词
  }
  userIdea: string              // 用户的研究方向或粗略 idea
}

// ========== 工作流会话 ==========

export type IdeaSessionStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export interface IdeaSession {
  id?: number
  groupId: number               // 关联的论文分组
  groupName: string             // 分组名称（冗余存储，便于显示）
  timestamp: string             // 会话时间戳 YYYY-MM-DD-HH-MM-SS
  status: IdeaSessionStatus
  localPath: string             // 本地存储路径（相对于根目录）
  bestIdeaSlug?: string         // 最佳 idea 来源模型
  createdAt: Date
  completedAt?: Date
  error?: string                // 错误信息
}

// ========== 工作流状态 ==========

export type WorkflowPhase = 'idle' | 'preparing' | 'generating' | 'evaluating' | 'summarizing' | 'completed' | 'failed' | 'cancelled'

export type ModelStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface ModelTaskState {
  status: ModelStatus
  output?: string               // 生成的内容
  error?: string                // 错误信息
  startTime?: Date
  endTime?: Date
}

export interface WorkflowState {
  phase: WorkflowPhase
  sessionId?: number
  groupId?: number
  groupName?: string
  // 各阶段模型状态
  generators: Map<string, ModelTaskState>
  evaluators: Map<string, ModelTaskState>
  summarizer: ModelTaskState
  // 进度
  progress: {
    current: number
    total: number
    description: string
  }
  // 结果
  bestIdea?: string
  error?: string
}

// ========== LLM 服务接口 ==========

export interface LLMRequest {
  provider: ModelProvider
  model: string
  systemPrompt: string
  userMessage: string
  temperature?: number
  maxTokens?: number
  thinkingConfig?: ThinkingConfig
  signal?: AbortSignal
}

export interface LLMResponse {
  content: string
  thinkingContent?: string
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  error?: string
}

// ========== API 端点配置 ==========

export interface ApiEndpoints {
  openai: string                // OpenAI 兼容端点 (Claude/GPT/o4)
  aliyun: string                // 阿里云 Qwen
}

export const DEFAULT_ENDPOINTS: ApiEndpoints = {
  openai: 'https://api.oaipro.com/v1',
  aliyun: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
}

// ========== 预设模型 ==========

export const PRESET_GENERATORS: ModelConfig[] = [
  {
    id: 'preset-gemini-gen',
    slug: 'Gemini 2.5 Pro',
    provider: 'google',
    model: 'gemini-2.5-pro',
    enabled: true,
    isPreset: true,
    temperature: 1.0,
    maxTokens: 12000,
    thinkingConfig: {
      thinkingBudget: 32000,
      includeThoughts: false
    }
  },
  {
    id: 'preset-gemini3-gen',
    slug: 'Gemini 3 Pro',
    provider: 'google',
    model: 'gemini-3-pro-preview',
    enabled: false,
    isPreset: true,
    temperature: 1.0,
    maxTokens: 12000,
    thinkingConfig: {
      thinkingLevel: 'low',
      includeThoughts: false
    }
  },
  {
    id: 'preset-claude-gen',
    slug: 'Claude 4.5 Sonnet',
    provider: 'openai',  // 通过 OpenAI 兼容端点调用
    model: 'claude-sonnet-4-5-20250929',
    enabled: false,
    isPreset: true,
    temperature: 1,
    maxTokens: 8192,
    thinkingConfig: {
      thinkingType: 'enabled',
      budgetTokens: 3500
    }
  },
  {
    id: 'preset-claude-opus-gen',
    slug: 'Claude 4.5 Opus',
    provider: 'openai',
    model: 'claude-opus-4-5-20251101',
    enabled: false,
    isPreset: true,
    temperature: 1,
    maxTokens: 8192,
    thinkingConfig: {
      thinkingType: 'enabled',
      budgetTokens: 3500
    }
  },
  {
    id: 'preset-gpt5-gen',
    slug: 'GPT-5',
    provider: 'openai',
    model: 'gpt-5',
    enabled: false,
    isPreset: true,
    maxTokens: 8000,
    thinkingConfig: {
      reasoningEffort: 'low',
      verbosity: 'low'
    }
  },
  {
    id: 'preset-gpt51-gen',
    slug: 'GPT-5.1',
    provider: 'openai',
    model: 'gpt-5.1',
    enabled: false,
    isPreset: true,
    maxTokens: 8000,
    thinkingConfig: {
      reasoningEffort: 'low',
      verbosity: 'low'
    }
  },
  {
    id: 'preset-o4-gen',
    slug: 'o4-mini',
    provider: 'openai',
    model: 'o4-mini',
    enabled: false,
    isPreset: true,
    maxTokens: 8000,
    thinkingConfig: {
      reasoningEffort: 'low'
    }
  },
  {
    id: 'preset-o3-gen',
    slug: 'o3',
    provider: 'openai',
    model: 'o3',
    enabled: false,
    isPreset: true,
    maxTokens: 8000,
    thinkingConfig: {
      reasoningEffort: 'low'
    }
  },
  {
    id: 'preset-qwen-gen',
    slug: 'Qwen3 Max',
    provider: 'aliyun',
    model: 'qwen3-max-preview',
    enabled: false,
    isPreset: true,
    maxTokens: 8000,
    thinkingConfig: {
      enableThinking: true
    }
  }
]

export const PRESET_EVALUATORS: ModelConfig[] = [
  {
    id: 'preset-gemini-eval',
    slug: 'Gemini 2.5 Pro',
    provider: 'google',
    model: 'gemini-2.5-pro',
    enabled: true,
    isPreset: true,
    temperature: 0.1,
    maxTokens: 14000,
    thinkingConfig: {
      thinkingBudget: -1,  // 动态
      includeThoughts: false
    }
  },
  {
    id: 'preset-gemini3-eval',
    slug: 'Gemini 3 Pro',
    provider: 'google',
    model: 'gemini-3-pro-preview',
    enabled: false,
    isPreset: true,
    temperature: 0.1,
    maxTokens: 14000,
    thinkingConfig: {
      thinkingLevel: 'high',
      includeThoughts: false
    }
  },
  {
    id: 'preset-claude-sonnet-eval',
    slug: 'Claude 4.5 Sonnet',
    provider: 'openai',
    model: 'claude-sonnet-4-5-20250929',
    enabled: false,
    isPreset: true,
    temperature: 0.5,
    maxTokens: 12000,
    thinkingConfig: {
      thinkingType: 'enabled',
      budgetTokens: 5000
    }
  },
  {
    id: 'preset-claude-opus-eval',
    slug: 'Claude 4.5 Opus',
    provider: 'openai',
    model: 'claude-opus-4-5-20251101',
    enabled: false,
    isPreset: true,
    temperature: 0.5,
    maxTokens: 12000,
    thinkingConfig: {
      thinkingType: 'enabled',
      budgetTokens: 5000
    }
  },
  {
    id: 'preset-gpt51-eval',
    slug: 'GPT-5.1',
    provider: 'openai',
    model: 'gpt-5.1',
    enabled: false,
    isPreset: true,
    maxTokens: 12000,
    thinkingConfig: {
      reasoningEffort: 'medium',
      verbosity: 'low'
    }
  },
  {
    id: 'preset-o4-eval',
    slug: 'o4-mini',
    provider: 'openai',
    model: 'o4-mini',
    enabled: false,
    isPreset: true,
    maxTokens: 12000,
    thinkingConfig: {
      reasoningEffort: 'medium'
    }
  },
  {
    id: 'preset-o3-eval',
    slug: 'o3',
    provider: 'openai',
    model: 'o3',
    enabled: false,
    isPreset: true,
    maxTokens: 12000,
    thinkingConfig: {
      reasoningEffort: 'medium'
    }
  },
  {
    id: 'preset-qwen-eval',
    slug: 'Qwen3 Max',
    provider: 'aliyun',
    model: 'qwen3-max-preview',
    enabled: false,
    isPreset: true,
    maxTokens: 10000,
    thinkingConfig: {
      enableThinking: true
    }
  }
]

export const PRESET_SUMMARIZER: ModelConfig = {
  id: 'preset-gemini-sum',
  slug: 'Gemini 2.5 Pro',
  provider: 'google',
  model: 'gemini-2.5-pro',
  enabled: true,
  isPreset: true,
  temperature: 0.4,
  maxTokens: 8000,
  thinkingConfig: {
    thinkingBudget: -1,
    includeThoughts: false
  }
}
