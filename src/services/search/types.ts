export interface VenueStatus {
  fetched: boolean
  indexed: boolean
  total_papers?: number | null
  fetch_date?: string | null
  file_size_mb?: number | null
}

export interface Venue {
  name: string
  display_name: string
  min_year: number
  status: Record<string, VenueStatus>
}

export interface SearchPaper {
  id: string
  title: string
  title_zh: string
  authors: string[]
  abstract: string
  abstract_zh: string
  keywords: string[]
  venue: string
  year: number
  decision: string
  pdf_url: string
  forum_url: string
  relevance_score: number
  relevance_reason: string
  rrf_score: number
  search_source: string
}

export interface SearchResult {
  papers: SearchPaper[]
  keywords: string[]
  expanded_keywords: string[]
  total_candidates: number
}

export interface VenueResult {
  venue: string
  selected_year: number
  status: 'ok' | 'empty' | 'error'
  total_candidates: number
  papers: SearchPaper[]
}

export interface MultiSearchResult {
  topic: string
  keywords: string[]
  expanded_keywords: string[]
  venues: VenueResult[]
  failures: { venue: string; year?: number; stage: string; reason: string }[]
  summary: {
    requested_venues: number
    successful_venues: number
    failed_venues: number
    returned_papers: number
  }
}

export interface SearchProgress {
  stage: string
  venue?: string
  year?: number
  evaluated?: number
  translated?: number
  total?: number
  papers?: number
  message?: string
}

export interface JobStatus {
  status: 'not_started' | 'running' | 'done' | 'error' | 'already_running'
  progress?: number
  total?: number
  message?: string
  cached?: boolean
  indexed?: boolean
  metadata?: {
    total_papers: number
    fetch_date: string
    file_size_mb: number
  }
  result?: {
    total: number
    venue: string
    year: number
  }
}

export interface SearchHistoryVenue {
  venue: string
  display_name: string
  years: number[]
  fetched: boolean
  indexed: boolean
  total_papers?: number | null
}

export interface SearchHistoryRecord {
  id: string
  createdAt: string
  query: string
  years: number[]
  venues: SearchHistoryVenue[]
  topK: number
  useLLM: boolean
  useChineseReason: boolean
  useBilingualTranslation: boolean
  resultSummary: string
  keywords: string[]
  papers: SearchPaper[]
}
