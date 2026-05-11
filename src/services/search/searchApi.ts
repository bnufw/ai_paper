import type {
  JobStatus,
  MultiSearchResult,
  SearchProgress,
  SearchResult,
  Venue
} from './types'

const BASE = '/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return response.json()
}

async function sseRequest<T>(
  path: string,
  body: unknown,
  onProgress?: (progress: SearchProgress) => void,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('text/event-stream')) {
    return response.json() as Promise<T>
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('搜索服务没有返回数据流')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let result: T | null = null

  function processEvents(raw: string) {
    const blocks = raw.split(/\n\n/)
    for (const block of blocks) {
      if (!block.trim()) continue

      let eventType = ''
      const dataLines: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          dataLines.push(line.slice(6))
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5))
        }
      }

      if (dataLines.length === 0) continue
      const parsed = JSON.parse(dataLines.join('\n'))

      if (eventType === 'progress') {
        onProgress?.(parsed as SearchProgress)
      } else if (eventType === 'result') {
        result = parsed as T
      } else if (eventType === 'error') {
        throw new Error(parsed.message || '搜索失败')
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lastBoundary = buffer.lastIndexOf('\n\n')
    if (lastBoundary !== -1) {
      const complete = buffer.slice(0, lastBoundary + 2)
      buffer = buffer.slice(lastBoundary + 2)
      processEvents(complete)
    }
  }

  if (buffer.trim()) {
    processEvents(buffer)
  }

  if (!result) {
    throw new Error('搜索服务没有返回结果')
  }

  return result
}

export const searchApi = {
  getVenues: (signal?: AbortSignal) =>
    request<Venue[]>('/venues', { signal }),

  fetchPapers: (venue: string, year: number, force = false) =>
    request<{ job_id: string; status: string }>('/fetch', {
      method: 'POST',
      body: JSON.stringify({ venue, year, force })
    }),

  getFetchStatus: (venue: string, year: number, signal?: AbortSignal) =>
    request<JobStatus>(`/fetch/${venue}/${year}/status`, { signal }),

  buildIndex: (venue: string, year: number, force = false) =>
    request<{ job_id: string; status: string }>('/index', {
      method: 'POST',
      body: JSON.stringify({ venue, year, force })
    }),

  getIndexStatus: (venue: string, year: number, signal?: AbortSignal) =>
    request<JobStatus>(`/index/${venue}/${year}/status`, { signal }),

  search: (
    params: {
      venue: string
      year: number
      research_description: string
      top_k?: number
      max_concurrent?: number
      use_llm_eval?: boolean
      use_bilingual_translation?: boolean
      use_chinese_relevance_reason?: boolean
      vector_weight?: number
      keyword_weight?: number
    },
    onProgress?: (progress: SearchProgress) => void,
    signal?: AbortSignal
  ) => sseRequest<SearchResult>('/search', params, onProgress, signal),

  multiSearch: (
    params: {
      research_description: string
      venues?: { venue: string; year: number }[]
      auto_latest?: boolean
      top_k?: number
      max_concurrent?: number
      use_llm_eval?: boolean
      use_chinese_relevance_reason?: boolean
      use_bilingual_translation?: boolean
    },
    onProgress?: (progress: SearchProgress) => void,
    signal?: AbortSignal
  ) => sseRequest<MultiSearchResult>('/multi-search', params, onProgress, signal)
}
