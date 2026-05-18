import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  findPaperBySource,
  getAllGroups,
  type PaperGroup
} from '../../services/storage/db'
import { processAndSavePaper } from '../../services/paper/importPaper'
import { fetchPdfFile } from '../../services/pdf/pdfFetcher'
import { searchApi } from '../../services/search/searchApi'
import {
  clearSearchHistory,
  deleteSearchHistory,
  listSearchHistory,
  saveSearchHistory
} from '../../services/search/searchHistory'
import type {
  JobStatus,
  SearchHistoryRecord,
  SearchPaper,
  SearchProgress,
  Venue
} from '../../services/search/types'

interface SearchImportTabProps {
  onImportComplete: (paperId: number) => void
}

const FALLBACK_VENUES: Venue[] = [
  { name: 'NeurIPS', display_name: 'NeurIPS', min_year: 2024, status: {} },
  { name: 'ICLR', display_name: 'ICLR', min_year: 2024, status: {} },
  { name: 'ICML', display_name: 'ICML', min_year: 2024, status: {} },
  { name: 'CVPR', display_name: 'CVPR', min_year: 2024, status: {} },
  { name: 'ICCV', display_name: 'ICCV', min_year: 2023, status: {} },
  { name: 'AAAI', display_name: 'AAAI', min_year: 2024, status: {} }
]

const IMPORT_SOURCE_HOST_SUFFIXES = [
  'openreview.net',
  'thecvf.com',
  'arxiv.org',
  'semanticscholar.org',
  'aclanthology.org',
  'proceedings.mlr.press',
  'neurips.cc',
  'nips.cc',
  'aaai.org',
  'doi.org'
] as const

const DEFAULT_SEARCH_YEARS = [2026, 2025]
const MIN_LLM_RESULTS_PER_DATASET = 3

interface VenueYearSelection {
  venue: string
  year: number
}

interface SearchRunOptions {
  query: string
  years: number[]
  venueNames: string[]
  venueYearPairs: VenueYearSelection[]
  topK: number
  useLLM: boolean
  useChineseReason: boolean
  useBilingualTranslation: boolean
  saveHistorySnapshot: boolean
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function statusText(status: JobStatus | null, kind: 'fetch' | 'index'): string {
  if (!status) return '未检查'
  if (status.status === 'running') {
    const count = status.total ? ` ${status.progress || 0}/${status.total}` : ''
    return `${status.message || '运行中'}${count}`
  }
  if (status.status === 'error') return status.message || '失败'
  if (kind === 'fetch' && (status.cached || status.status === 'done')) {
    const total = status.metadata?.total_papers ?? status.result?.total
    return total != null ? `${total.toLocaleString()} 篇` : '已获取'
  }
  if (kind === 'index' && (status.indexed || status.status === 'done')) return '已索引'
  return '未开始'
}

function statusClass(status: JobStatus | null, readyFlag?: boolean): string {
  if (status?.status === 'running') return 'text-blue-600'
  if (status?.status === 'error') return 'text-red-600'
  if (readyFlag || status?.status === 'done') return 'text-green-600'
  return 'text-gray-500'
}

function statusKey(venue: string, year: number): string {
  return `${venue}_${year}`
}

function yearStatus(venue: Venue, year: number) {
  return venue.status[String(year)]
}

function getLocalDataYears(venues: Venue[]): number[] {
  const years = new Set<number>()
  venues.forEach(venue => {
    Object.entries(venue.status).forEach(([year, status]) => {
      if (status.fetched || status.indexed) {
        years.add(Number(year))
      }
    })
  })
  return Array.from(years).filter(Number.isFinite).sort((a, b) => b - a)
}

function getDefaultSearchYears(searchYears: number[]): number[] {
  const preferredYears = DEFAULT_SEARCH_YEARS.filter(year => searchYears.includes(year))
  return preferredYears.length > 0 ? preferredYears : searchYears.slice(0, 2)
}

function hasLocalSearchData(venue: Venue, year: number): boolean {
  const status = yearStatus(venue, year)
  return Boolean(status?.fetched || status?.indexed)
}

function metadataText(venue: Venue, year: number): string {
  const status = yearStatus(venue, year)
  if (!status?.fetched) return '未获取'
  return status.total_papers != null ? `${status.total_papers.toLocaleString()} 篇` : '已获取'
}

function indexText(status: JobStatus | null, indexed?: boolean): string {
  if (status?.status === 'running') {
    const count = status.total ? ` ${status.progress || 0}/${status.total}` : ''
    return `${status.message || '运行中'}${count}`
  }
  if (status?.status === 'error') return status.message || '失败'
  if (indexed || status?.indexed || status?.status === 'done') return '已索引'
  return '未索引'
}

function scorePercent(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score * 100)))
}

function isImportableSourceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return IMPORT_SOURCE_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))
  } catch {
    return false
  }
}

function getImportSourceUrl(paper: SearchPaper): string {
  const pdfUrl = paper.pdf_url?.trim()
  if (pdfUrl) return pdfUrl

  const forumUrl = paper.forum_url?.trim()
  return forumUrl && isImportableSourceUrl(forumUrl) ? forumUrl : ''
}

function selectedHistoryVenues(venues: Venue[], selectedVenues: string[], years: number[]) {
  return selectedVenues.map(name => {
    const venue = venues.find(item => item.name === name)
    const localYears = venue
      ? years.filter(year => hasLocalSearchData(venue, year))
      : []
    return {
      venue: name,
      display_name: venue?.display_name || name,
      years: localYears,
      fetched: venue ? localYears.some(year => Boolean(yearStatus(venue, year)?.fetched)) : false,
      indexed: venue ? localYears.some(year => Boolean(yearStatus(venue, year)?.indexed)) : false,
      total_papers: venue
        ? localYears.reduce((total, year) => total + (yearStatus(venue, year)?.total_papers || 0), 0)
        : null
    }
  })
}

function getVenueYearPairs(
  venues: Venue[],
  selectedVenues: string[],
  selectedYears: number[]
): VenueYearSelection[] {
  return selectedVenues.flatMap(venueName => {
    const venue = venues.find(item => item.name === venueName)
    if (!venue) return []
    return selectedYears
      .filter(year => hasLocalSearchData(venue, year))
      .map(year => ({ venue: venueName, year }))
  })
}

function requestTopK(visibleTopK: number, pairCount: number, useLLMEval: boolean): number {
  if (!useLLMEval || pairCount <= 1) return visibleTopK
  return Math.min(
    visibleTopK,
    Math.max(MIN_LLM_RESULTS_PER_DATASET, Math.ceil(visibleTopK / pairCount))
  )
}

function formatYears(years: number[]): string {
  if (years.length === 0) return '未选择年份'
  return [...years].sort((a, b) => b - a).join('、')
}

function searchYearOptionText(venues: Venue[], year: number): string {
  const rows = venues
    .map(venue => yearStatus(venue, year))
    .filter(status => status?.fetched || status?.indexed)
  const indexed = rows.filter(status => status?.indexed).length
  return `${indexed}/${rows.length} 已索引`
}

function venueSearchStatusText(venue: Venue, years: number[]): string {
  return years
    .filter(year => hasLocalSearchData(venue, year))
    .map(year => {
      const status = yearStatus(venue, year)
      return `${year} ${status?.indexed ? '已索引' : '仅获取'}`
    })
    .join('、')
}

function historyTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function failureMessage(failures: { venue: string; year?: number; stage: string; reason: string }[]): string {
  return failures
    .map(failure => `${failure.venue}${failure.year ? ` ${failure.year}` : ''} ${failure.stage}: ${failure.reason}`)
    .join('\n')
}

function PaperResultCard({
  paper,
  rank,
  importing,
  imported,
  importProgress,
  onImport
}: {
  paper: SearchPaper
  rank: number
  importing: boolean
  imported: boolean
  importProgress?: { stage: string; percent: number }
  onImport: (paper: SearchPaper) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const title = paper.title?.trim() || paper.title_zh?.trim() || 'Untitled'
  const titleZh = paper.title_zh?.trim()
  const abstract = paper.abstract_zh?.trim() || paper.abstract?.trim()
  const pct = scorePercent(paper.relevance_score)
  const authors = paper.authors.slice(0, 4).join(', ')
  const moreAuthors = paper.authors.length > 4 ? ` +${paper.authors.length - 4}` : ''
  const importSourceUrl = getImportSourceUrl(paper)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 text-sm font-bold flex items-center justify-center shrink-0">
          {rank}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 leading-snug">{title}</h3>
              {titleZh && titleZh !== title && (
                <p className="text-xs text-gray-500 mt-1 leading-snug">{titleZh}</p>
              )}
            </div>
            <button
              onClick={() => onImport(paper)}
              disabled={importing || imported || !importSourceUrl}
              title={importSourceUrl ? undefined : '搜索结果缺少 PDF 链接，无法导入'}
              className="shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {imported ? '已导入' : importing ? '导入中' : importSourceUrl ? '导入' : '缺少 PDF'}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
              {paper.venue} {paper.year}
            </span>
            <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full">
              {paper.decision || 'N/A'}
            </span>
            {authors && <span>{authors}{moreAuthors}</span>}
          </div>

          <div className="mt-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs font-mono text-gray-600">{pct}%</span>
            </div>
            {paper.relevance_reason && (
              <p className="text-xs text-gray-500 mt-1">{paper.relevance_reason}</p>
            )}
          </div>

          {paper.keywords.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {paper.keywords.slice(0, 6).map(keyword => (
                <span key={keyword} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                  {keyword}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-4 text-xs">
            <button
              onClick={() => setExpanded(value => !value)}
              className="text-blue-600 hover:text-blue-700"
            >
              {expanded ? '收起摘要' : '查看摘要'}
            </button>
            {paper.forum_url && (
              <a
                href={paper.forum_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700"
              >
                OpenReview
              </a>
            )}
            {paper.pdf_url && (
              <a
                href={paper.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700"
              >
                PDF
              </a>
            )}
          </div>

          {expanded && (
            <p className="mt-3 text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
              {abstract || '暂无摘要'}
            </p>
          )}

          {importing && importProgress && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{importProgress.stage}</span>
                <span>{Math.round(importProgress.percent)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${importProgress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SearchImportTab({ onImportComplete }: SearchImportTabProps) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [groups, setGroups] = useState<PaperGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>(undefined)
  const [selectedSearchYears, setSelectedSearchYears] = useState<number[]>([])
  const [selectedSearchVenues, setSelectedSearchVenues] = useState<string[]>([])
  const [selectedPrepYear, setSelectedPrepYear] = useState(0)
  const [customPrepYear, setCustomPrepYear] = useState('')
  const [showCustomPrepYear, setShowCustomPrepYear] = useState(false)
  const [fetchStatuses, setFetchStatuses] = useState<Record<string, JobStatus>>({})
  const [indexStatuses, setIndexStatuses] = useState<Record<string, JobStatus>>({})
  const [polling, setPolling] = useState(false)
  const [dataError, setDataError] = useState('')

  const [description, setDescription] = useState('')
  const [topK, setTopK] = useState(25)
  const [useLLM, setUseLLM] = useState(false)
  const [useChineseReason, setUseChineseReason] = useState(false)
  const [useBilingualTranslation, setUseBilingualTranslation] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [progress, setProgress] = useState<SearchProgress | null>(null)
  const [resultPapers, setResultPapers] = useState<SearchPaper[]>([])
  const [resultSummary, setResultSummary] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [searchHistory, setSearchHistory] = useState<SearchHistoryRecord[]>([])
  const [importingPaperId, setImportingPaperId] = useState<string | null>(null)
  const [importedPaperIds, setImportedPaperIds] = useState<Set<string>>(() => new Set())
  const [importProgress, setImportProgress] = useState<{ stage: string; percent: number } | null>(null)
  const [importNotice, setImportNotice] = useState('')

  const searchAbortRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)
  const didInitializeSearchYearsRef = useRef(false)
  const pendingSearchVenuesRef = useRef<string[] | null>(null)

  const loadVenues = useCallback(async (signal?: AbortSignal) => {
    const data = await searchApi.getVenues(signal)
    if (!isMountedRef.current) return
    setVenues(data)
    setDataError('')
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    loadVenues(controller.signal).catch(error => {
      if (isAbortError(error)) return
      console.error('加载搜索会议失败:', error)
      setVenues(FALLBACK_VENUES)
      setDataError('搜索后端未响应，请启动后端服务后刷新。')
    })

    getAllGroups()
      .then(setGroups)
      .catch(error => {
        console.error('加载分组失败:', error)
        setDataError(errorMessage(error, '加载分组失败'))
      })

    listSearchHistory()
      .then(setSearchHistory)
      .catch(error => {
        console.error('加载搜索记录失败:', error)
      })

    return () => controller.abort()
  }, [loadVenues])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      searchAbortRef.current?.abort()
    }
  }, [])

  const searchYears = useMemo(() => getLocalDataYears(venues), [venues])

  const prepYears = useMemo(() => {
    const minYear = venues.reduce((min, venue) => Math.min(min, venue.min_year), 2024)
    const thisYear = new Date().getFullYear()
    const defaultYears = minYear <= thisYear
      ? Array.from({ length: thisYear - minYear + 1 }, (_, index) => thisYear - index)
      : [minYear]
    const knownYears = getLocalDataYears(venues)

    return Array.from(new Set([...knownYears, ...defaultYears])).sort((a, b) => b - a)
  }, [venues])

  const searchVenueRows = useMemo(
    () => venues.filter(venue => {
      return selectedSearchYears.some(year => hasLocalSearchData(venue, year))
    }),
    [selectedSearchYears, venues]
  )

  const selectedVenueYearPairs = useMemo(
    () => getVenueYearPairs(venues, selectedSearchVenues, selectedSearchYears),
    [selectedSearchVenues, selectedSearchYears, venues]
  )

  const prepVenueRows = useMemo(
    () => venues,
    [venues]
  )

  useEffect(() => {
    if (searchYears.length === 0) {
      setSelectedSearchYears([])
      didInitializeSearchYearsRef.current = false
      return
    }

    setSelectedSearchYears(current => {
      const availableYears = current.filter(year => searchYears.includes(year))
      if (!didInitializeSearchYearsRef.current || (current.length > 0 && availableYears.length === 0)) {
        didInitializeSearchYearsRef.current = true
        return getDefaultSearchYears(searchYears)
      }
      if (availableYears.length !== current.length) return availableYears
      return current
    })
  }, [searchYears])

  useEffect(() => {
    if (selectedPrepYear === 0) {
      setSelectedPrepYear(searchYears[0] || new Date().getFullYear())
    }
  }, [searchYears, selectedPrepYear])

  useEffect(() => {
    if (selectedSearchYears.length === 0) {
      setSelectedSearchVenues([])
      return
    }

    if (pendingSearchVenuesRef.current) {
      setSelectedSearchVenues(pendingSearchVenuesRef.current)
      pendingSearchVenuesRef.current = null
      return
    }

    setSelectedSearchVenues(
      searchVenueRows
        .filter(venue => selectedSearchYears.some(year => Boolean(yearStatus(venue, year)?.indexed)))
        .map(venue => venue.name)
    )
  }, [searchVenueRows, selectedSearchYears])

  const pollStatus = useCallback(async () => {
    if (!selectedPrepYear || venues.length === 0) return

    try {
      const [nextFetchEntries, nextIndexEntries] = await Promise.all([
        Promise.all(venues.map(async venue => [
          statusKey(venue.name, selectedPrepYear),
          await searchApi.getFetchStatus(venue.name, selectedPrepYear)
        ] as const)),
        Promise.all(venues.map(async venue => [
          statusKey(venue.name, selectedPrepYear),
          await searchApi.getIndexStatus(venue.name, selectedPrepYear)
        ] as const))
      ])
      if (!isMountedRef.current) return
      const nextFetchStatuses = Object.fromEntries(nextFetchEntries)
      const nextIndexStatuses = Object.fromEntries(nextIndexEntries)
      setFetchStatuses(nextFetchStatuses)
      setIndexStatuses(nextIndexStatuses)

      const running = [...Object.values(nextFetchStatuses), ...Object.values(nextIndexStatuses)]
        .some(status => status.status === 'running')
      if (!running && polling) {
        setPolling(false)
        await loadVenues()
      }
    } catch (error) {
      setDataError(errorMessage(error, '检查数据状态失败'))
      setPolling(false)
    }
  }, [loadVenues, polling, selectedPrepYear, venues])

  useEffect(() => {
    if (!selectedPrepYear || venues.length === 0) return
    pollStatus()
  }, [pollStatus, selectedPrepYear, venues])

  useEffect(() => {
    if (!polling) return
    const timer = window.setInterval(pollStatus, 2000)
    return () => window.clearInterval(timer)
  }, [polling, pollStatus])

  const handlePrepYearSelect = (value: string) => {
    if (value === '__custom__') {
      setShowCustomPrepYear(true)
      setSelectedPrepYear(0)
      return
    }

    setShowCustomPrepYear(false)
    setCustomPrepYear('')
    setSelectedPrepYear(Number(value))
    setFetchStatuses({})
    setIndexStatuses({})
  }

  const handleCustomPrepYearConfirm = () => {
    const minYear = venues.reduce((min, venue) => Math.min(min, venue.min_year), 2024)
    const year = Number(customPrepYear)
    if (!Number.isInteger(year) || year < minYear || year > 2100) {
      setDataError(`年份需要在 ${minYear} 到 2100 之间`)
      return
    }

    setDataError('')
    setSelectedPrepYear(year)
    setShowCustomPrepYear(false)
  }

  const handleFetch = async (venueName: string) => {
    if (!venueName || !selectedPrepYear) return
    setDataError('')
    try {
      await searchApi.fetchPapers(venueName, selectedPrepYear, false)
      setPolling(true)
      await pollStatus()
    } catch (error) {
      setDataError(errorMessage(error, '获取论文失败'))
    }
  }

  const handleIndex = async (venueName: string) => {
    if (!venueName || !selectedPrepYear) return
    setDataError('')
    try {
      await searchApi.buildIndex(venueName, selectedPrepYear, false)
      setPolling(true)
      await pollStatus()
    } catch (error) {
      setDataError(errorMessage(error, '构建索引失败'))
    }
  }

  const toggleSearchVenue = (venueName: string) => {
    setSelectedSearchVenues(current =>
      current.includes(venueName)
        ? current.filter(name => name !== venueName)
        : [...current, venueName]
    )
  }

  const toggleSearchYear = (year: number) => {
    setSelectedSearchYears(current => (
      current.includes(year)
        ? current.filter(item => item !== year)
        : [...current, year].sort((a, b) => b - a)
    ))
  }

  const runSearch = useCallback(async (options: SearchRunOptions) => {
    if (!options.query || options.venueYearPairs.length === 0) return
    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller

    setSearching(true)
    setSearchError('')
    setProgress(null)
    setResultPapers([])
    setResultSummary('')
    setKeywords([])
    setImportNotice('')

    try {
      const backendTopK = requestTopK(options.topK, options.venueYearPairs.length, options.useLLM)
      const result = await searchApi.multiSearch(
        {
          research_description: options.query,
          auto_latest: false,
          venues: options.venueYearPairs,
          top_k: backendTopK,
          use_llm_eval: options.useLLM,
          use_chinese_relevance_reason: options.useChineseReason,
          use_bilingual_translation: options.useBilingualTranslation
        },
        setProgress,
        controller.signal
      )

      if (result.failures.length > 0) {
        throw new Error(failureMessage(result.failures))
      }

      const papers = result.venues
        .flatMap(venue => venue.papers)
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, options.topK)
      const pairYears = Array.from(new Set(options.venueYearPairs.map(pair => pair.year))).sort((a, b) => b - a)
      const pairVenues = Array.from(new Set(options.venueYearPairs.map(pair => pair.venue)))
      const summary = `${formatYears(pairYears)} · ${pairVenues.length} 个会议 · ${options.venueYearPairs.length} 个数据集 · ${papers.length} 个结果`

      setResultPapers(papers)
      setResultSummary(summary)
      setKeywords(result.keywords)
      if (options.saveHistorySnapshot) {
        setSearchHistory(await saveSearchHistory({
          query: options.query,
          years: options.years,
          venues: selectedHistoryVenues(venues, options.venueNames, options.years),
          topK: options.topK,
          useLLM: options.useLLM,
          useChineseReason: options.useChineseReason,
          useBilingualTranslation: options.useBilingualTranslation,
          resultSummary: summary,
          keywords: result.keywords,
          papers
        }))
      }
    } catch (error) {
      if (!isAbortError(error)) {
        setSearchError(errorMessage(error, '搜索失败'))
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null
        setSearching(false)
        setProgress(null)
      }
    }
  }, [venues])

  const restoreHistory = (record: SearchHistoryRecord) => {
    searchAbortRef.current?.abort()
    const restoredVenues = record.venues.map(venue => venue.venue)
    const restoredPairs = getVenueYearPairs(venues, restoredVenues, record.years)
    pendingSearchVenuesRef.current = restoredVenues
    setSelectedSearchYears(record.years)
    setSelectedSearchVenues(restoredVenues)
    setDescription(record.query)
    setTopK(record.topK)
    setUseLLM(record.useLLM)
    setUseChineseReason(record.useChineseReason)
    setUseBilingualTranslation(record.useBilingualTranslation)
    setSearchError('')
    setProgress(null)
    setSearching(false)
    setImportNotice('')

    if (record.papers.length > 0) {
      setResultPapers(record.papers)
      setResultSummary(record.resultSummary || `${formatYears(record.years)} · ${restoredVenues.length} 个会议 · ${record.papers.length} 个结果`)
      setKeywords(record.keywords)
      return
    }

    setResultPapers([])
    setResultSummary('')
    setKeywords([])

    if (restoredPairs.length === 0) {
      setSearchError('搜索记录未保存结果快照，且当前本地数据不足，无法自动恢复。')
      return
    }

    void runSearch({
      query: record.query.trim(),
      years: record.years,
      venueNames: restoredVenues,
      venueYearPairs: restoredPairs,
      topK: record.topK,
      useLLM: record.useLLM,
      useChineseReason: record.useChineseReason,
      useBilingualTranslation: record.useBilingualTranslation,
      saveHistorySnapshot: true
    })
  }

  const handleDeleteHistory = async (recordId: string) => {
    setSearchHistory(await deleteSearchHistory(recordId))
  }

  const handleClearHistory = async () => {
    await clearSearchHistory()
    setSearchHistory([])
  }

  const handleSearch = async () => {
    await runSearch({
      query: description.trim(),
      years: selectedSearchYears,
      venueNames: selectedSearchVenues,
      venueYearPairs: selectedVenueYearPairs,
      topK,
      useLLM,
      useChineseReason,
      useBilingualTranslation,
      saveHistorySnapshot: true
    })
  }

  const handleImport = async (paper: SearchPaper) => {
    if (importingPaperId || importedPaperIds.has(paper.id)) return
    const importSourceUrl = getImportSourceUrl(paper)
    if (!importSourceUrl) {
      setSearchError('搜索结果缺少 PDF 链接，无法导入。')
      return
    }

    setImportingPaperId(paper.id)
    setImportProgress({ stage: '检查是否已导入...', percent: 3 })
    setSearchError('')
    setImportNotice('')

    try {
      const existing = await findPaperBySource(paper.id, importSourceUrl)
      if (existing?.id) {
        setImportProgress({ stage: '已存在', percent: 100 })
        setImportedPaperIds(current => new Set(current).add(paper.id))
        window.setTimeout(() => {
          if (!isMountedRef.current) return
          onImportComplete(existing.id!)
          setImportingPaperId(null)
          setImportProgress(null)
          setImportNotice('论文已存在，列表已刷新。')
        }, 300)
        return
      }

      setImportProgress({ stage: '正在下载 PDF...', percent: 8 })
      let downloadSource = 'direct'
      const pdfFile = await fetchPdfFile(
        importSourceUrl,
        paper.title || paper.id,
        source => {
          downloadSource = source
        }
      )

      setImportProgress({
        stage: downloadSource === 'proxy' ? '代理下载完成，准备 OCR...' : 'PDF 下载完成，准备 OCR...',
        percent: 15
      })

      const paperId = await processAndSavePaper(pdfFile, {
        groupId: selectedGroupId,
        titleFallback: paper.title,
        sourceMetadata: {
          sourceId: paper.id,
          sourceProvider: 'openreview_search',
          pdfUrl: importSourceUrl,
          forumUrl: paper.forum_url,
          venue: paper.venue,
          year: paper.year,
          authors: paper.authors
        },
        onProgress: (stage, percent) => {
          const mappedPercent = percent < 90 ? 15 + percent * 0.75 : percent
          setImportProgress({ stage, percent: mappedPercent })
        }
      })

      setImportProgress({ stage: '导入完成', percent: 100 })
      setImportedPaperIds(current => new Set(current).add(paper.id))
      window.setTimeout(() => {
        if (!isMountedRef.current) return
        onImportComplete(paperId)
        setImportingPaperId(null)
        setImportProgress(null)
        setImportNotice('导入完成，列表已刷新。')
      }, 500)
    } catch (error) {
      setSearchError(errorMessage(error, '导入失败'))
      setImportingPaperId(null)
      setImportProgress(null)
      setImportNotice('')
    }
  }

  const canSearch = Boolean(
    selectedVenueYearPairs.length > 0 && description.trim().length >= 3
  )
  const prepYearSelectValue = selectedPrepYear || prepYears[0] || ''

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        <div className="space-y-4">
          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">导入目标</h2>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-2">分组</label>
            <select
              value={selectedGroupId || ''}
              onChange={event => setSelectedGroupId(event.target.value ? Number(event.target.value) : undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">未分类</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">数据准备</h2>
              <button
                onClick={() => loadVenues().catch(error => setDataError(errorMessage(error, '刷新失败')))}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                刷新
              </button>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-2">年份</label>
            {showCustomPrepYear ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={customPrepYear}
                  onChange={event => setCustomPrepYear(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && handleCustomPrepYearConfirm()}
                  className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleCustomPrepYearConfirm}
                  className="px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
                >
                  OK
                </button>
              </div>
            ) : (
              <select
                value={prepYearSelectValue}
                onChange={event => handlePrepYearSelect(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {prepYears.map(year => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
                <option value="__custom__">添加年份</option>
              </select>
            )}

            {selectedPrepYear > 0 && (
              <div className="mt-4 space-y-2">
                {prepVenueRows.map(venue => {
                  const status = yearStatus(venue, selectedPrepYear)
                  const key = statusKey(venue.name, selectedPrepYear)
                  const fetchStatus = fetchStatuses[key] || null
                  const indexStatus = indexStatuses[key] || null
                  const fetched = Boolean(status?.fetched || fetchStatus?.cached || fetchStatus?.status === 'done')
                  const indexed = Boolean(status?.indexed || indexStatus?.indexed || indexStatus?.status === 'done')

                  return (
                    <div key={venue.name} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-700">{venue.display_name}</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          <span className={statusClass(fetchStatus, fetched)}>
                            {fetchStatus?.status === 'running' ? statusText(fetchStatus, 'fetch') : metadataText(venue, selectedPrepYear)}
                          </span>
                          <span className={statusClass(indexStatus, indexed)}>
                            {indexText(indexStatus, indexed)}
                          </span>
                        </div>
                      </div>
                      {!fetched ? (
                        <button
                          onClick={() => handleFetch(venue.name)}
                          disabled={fetchStatus?.status === 'running' || polling}
                          className="shrink-0 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          获取
                        </button>
                      ) : !indexed ? (
                        <button
                          onClick={() => handleIndex(venue.name)}
                          disabled={indexStatus?.status === 'running' || polling}
                          className="shrink-0 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          构建
                        </button>
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-green-700">已固定</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {dataError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {dataError}
              </div>
            )}
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">搜索记录</h2>
              {searchHistory.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-xs text-gray-500 hover:text-red-600"
                >
                  清空
                </button>
              )}
            </div>

            {searchHistory.length > 0 ? (
              <div className="space-y-2">
                {searchHistory.map(record => (
                  <div
                    key={record.id}
                    className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
                  >
                    <button
                      onClick={() => restoreHistory(record)}
                      className="w-full text-left"
                    >
                      <div className="text-sm font-medium text-gray-800 line-clamp-2">{record.query}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {formatYears(record.years)} · {record.venues.length} 个会议 · {record.papers.length} 个结果
                      </div>
                      <div className="mt-1 text-xs text-gray-400">{historyTime(record.createdAt)}</div>
                    </button>
                    <button
                      onClick={() => handleDeleteHistory(record.id)}
                      className="mt-2 text-xs text-gray-500 hover:text-red-600"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-gray-400 text-sm">暂无搜索记录</div>
            )}
          </section>
        </div>

        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-800">搜索论文</h2>
          </div>

          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">年份</label>
              {searchYears.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {searchYears.map(year => {
                    const checked = selectedSearchYears.includes(year)
                    return (
                      <label
                        key={year}
                        className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer ${
                          checked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSearchYear(year)}
                          className="h-4 w-4"
                        />
                        <span>{year}</span>
                        <span className="text-xs text-gray-500">{searchYearOptionText(venues, year)}</span>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <div className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-400">
                  暂无本地数据年份
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">会议</label>
              {searchVenueRows.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {searchVenueRows.map(venue => {
                    const checked = selectedSearchVenues.includes(venue.name)
                    return (
                      <label
                        key={venue.name}
                        className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer ${
                          checked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSearchVenue(venue.name)}
                          className="h-4 w-4"
                        />
                        <span>{venue.display_name}</span>
                        <span className="text-xs text-gray-500">
                          {venueSearchStatusText(venue, selectedSearchYears)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <div className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-400">
                  暂无可搜索会议
                </div>
              )}
            </div>
          </div>

          {selectedSearchYears.length === 0 && searchYears.length > 0 && (
            <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              至少选择一个年份。
            </div>
          )}

          {selectedSearchYears.length > 0 && selectedVenueYearPairs.length === 0 && (
            <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              至少选择一个有本地数据的会议年份组合。
            </div>
          )}

          <label className="block text-sm font-medium text-gray-700 mb-2">研究兴趣</label>
          <textarea
            value={description}
            onChange={event => setDescription(event.target.value)}
            rows={5}
            placeholder="例如：efficient continual learning under distribution shift with mixture-of-experts routing"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="mt-3">
            <button
              onClick={() => setShowAdvanced(value => !value)}
              className="text-xs text-gray-600 hover:text-gray-800"
            >
              {showAdvanced ? '收起高级选项' : '展开高级选项'}
            </button>

            {showAdvanced && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
                <label className="text-xs text-gray-600">
                  <span className="block mb-1">返回数量：{topK}</span>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={topK}
                    onChange={event => setTopK(Number(event.target.value))}
                    className="w-full"
                  />
                </label>

                <label className="flex items-start gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={useLLM}
                    onChange={event => {
                      setUseLLM(event.target.checked)
                      if (!event.target.checked) setUseChineseReason(false)
                    }}
                    className="mt-0.5"
                  />
                  <span>LLM 相关性评分（更慢）</span>
                </label>

                <label className={`flex items-start gap-2 text-xs ${useLLM ? 'text-gray-600' : 'text-gray-400'}`}>
                  <input
                    type="checkbox"
                    checked={useChineseReason}
                    onChange={event => setUseChineseReason(event.target.checked)}
                    disabled={!useLLM}
                    className="mt-0.5"
                  />
                  <span>中文相关性理由</span>
                </label>

                <label className="flex items-start gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={useBilingualTranslation}
                    onChange={event => setUseBilingualTranslation(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>双语标题和摘要</span>
                </label>
              </div>
            )}
          </div>

          {searchError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 whitespace-pre-line">
              {searchError}
            </div>
          )}

          {importNotice && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {importNotice}
            </div>
          )}

          <button
            onClick={handleSearch}
            disabled={!canSearch || searching}
            className="mt-5 w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {searching ? '搜索中...' : '搜索'}
          </button>

          {searching && (
            <div className="mt-3 text-xs text-gray-500">
              {progress?.message || '正在处理搜索请求...'}
            </div>
          )}

          <div className="mt-5 border-t border-gray-200 pt-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-800">搜索结果</h2>
                {resultSummary && <p className="text-xs text-gray-500 mt-1">{resultSummary}</p>}
              </div>
              {keywords.length > 0 && (
                <div className="hidden md:flex flex-wrap justify-end gap-1 max-w-xl">
                  {keywords.slice(0, 8).map(keyword => (
                    <span key={keyword} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                      {keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {resultPapers.length > 0 ? (
              <div className="space-y-3">
                {resultPapers.map((paper, index) => (
                  <PaperResultCard
                    key={`${paper.id}-${index}`}
                    paper={paper}
                    rank={index + 1}
                    importing={importingPaperId === paper.id}
                    imported={importedPaperIds.has(paper.id)}
                    importProgress={importingPaperId === paper.id ? importProgress || undefined : undefined}
                    onImport={handleImport}
                  />
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-gray-400 text-sm">
                搜索结果会显示在这里。
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
