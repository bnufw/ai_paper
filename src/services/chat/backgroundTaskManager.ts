/**
 * 后台任务管理器
 * 用于管理对话切换时在后台继续运行的 AI 请求
 */

export interface BackgroundTask {
  conversationId: number
  paperId: number
  startTime: Date
  status: 'running' | 'completed' | 'failed'
  result?: {
    content: string
    thoughts?: string
    thinkingTimeMs?: number
    generationStartTime?: Date
    generationEndTime?: Date
    groundingMetadata?: any
    webSearchQueries?: string[]
  }
  error?: string
  // 用于保存消息的上下文
  saveContext: {
    userMessage: {
      content: string
      images?: any[]
      timestamp: Date
    }
    editingId?: number
  }
  // 完成回调
  onComplete?: () => void
}

type TaskListener = (tasks: Map<number, BackgroundTask>) => void

class BackgroundTaskManager {
  private tasks: Map<number, BackgroundTask> = new Map()
  private listeners: Set<TaskListener> = new Set()

  /**
   * 注册后台任务
   * 当用户切换对话时，将当前正在进行的请求注册为后台任务
   */
  registerTask(
    conversationId: number,
    paperId: number,
    saveContext: BackgroundTask['saveContext']
  ): void {
    const task: BackgroundTask = {
      conversationId,
      paperId,
      startTime: new Date(),
      status: 'running',
      saveContext
    }
    this.tasks.set(conversationId, task)
    this.notifyListeners()
  }

  /**
   * 标记任务完成
   */
  completeTask(
    conversationId: number,
    result: BackgroundTask['result']
  ): void {
    const task = this.tasks.get(conversationId)
    if (task) {
      task.status = 'completed'
      task.result = result
      this.notifyListeners()

      // 触发完成回调
      if (task.onComplete) {
        task.onComplete()
      }
    }
  }

  /**
   * 标记任务失败
   */
  failTask(conversationId: number, error: string): void {
    const task = this.tasks.get(conversationId)
    if (task) {
      task.status = 'failed'
      task.error = error
      this.notifyListeners()
    }
  }

  /**
   * 获取任务
   */
  getTask(conversationId: number): BackgroundTask | undefined {
    return this.tasks.get(conversationId)
  }

  /**
   * 检查是否有运行中的任务
   */
  hasRunningTask(conversationId: number): boolean {
    const task = this.tasks.get(conversationId)
    return task?.status === 'running'
  }

  /**
   * 获取指定论文相关的所有运行中任务
   */
  getRunningTasksForPaper(paperId: number): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(
      t => t.paperId === paperId && t.status === 'running'
    )
  }

  /**
   * 移除任务（通常在结果被消费后调用）
   */
  removeTask(conversationId: number): void {
    this.tasks.delete(conversationId)
    this.notifyListeners()
  }

  /**
   * 设置任务完成回调
   */
  setOnComplete(conversationId: number, callback: () => void): void {
    const task = this.tasks.get(conversationId)
    if (task) {
      task.onComplete = callback
      // 如果任务已完成，立即触发
      if (task.status === 'completed') {
        callback()
      }
    }
  }

  /**
   * 订阅任务变更
   */
  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener)
    // 立即通知当前状态
    listener(this.tasks)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * 获取所有任务（用于调试）
   */
  getAllTasks(): Map<number, BackgroundTask> {
    return new Map(this.tasks)
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.tasks)
    }
  }
}

// 导出单例
export const backgroundTaskManager = new BackgroundTaskManager()
