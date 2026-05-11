import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  findPaperBySource,
  getAllGroups,
  type PaperGroup
} from '../../services/storage/db'
import { processAndSavePaper } from '../../services/paper/importPaper'
import { fetchPdfFile } from '../../services/pdf/pdfFetcher'
import { searchApi } from '../../services/search/searchApi'
import type {
  JobStatus,
  SearchPaper,
  SearchProgress,
  Venue
} from '../../services/search/types'

interface SearchImportTabProps {
  onImportComplete: (paperId: number) => void
}

type SearchMode = 'single' | 'multi'

const FALLBACK_VENUES: Venue[] = [
  { name: 'NeurIPS', display_name: 'NeurIPS', min_year: 2024, status: {} },
  { name: 'ICLR', display_name: 'ICLR', min_year: 2024, status: {} },
  { name: 'ICML', display_name: 'ICML', min_year: 2024, status: {} },
  { name: 'CVPR', display_name: 'CVPR', min_year: 2024, status: {} },
  { name: 'ICCV', display_name: 'ICCV', min_year: 2023, status: {} },
  { name: 'AAAI', display_name: 'AAAI', min_year: 2024, status: {} }
]

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

function scorePercent(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score * 100)))
}

function latestReadyYear(venue: Venue | undefined, fallbackYears: number[]): number {
  const status = venue?.status ?? {}
  const yearsByState = (key: keyof Venue['status'][string]) =>
    Object.entries(status)
      .filter(([, value]) => value[key])
      .map(([year]) => Number(year))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)

  return yearsByState('indexed')[0] || yearsByState('fetched')[0] || fallbackYears[0] || 0
}

function PaperResultCard({
  paper,
  rank,
  importing,
  importProgress,
  onImport
}: {
  paper: SearchPaper
  rank: number
  importing: boolean
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
              disabled={importing || !paper.pdf_url}
              className="shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {importing ? '导入中' : '导入'}
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
  const [selectedVenue, setSelectedVenue] = useState('')
  const [selectedYear, setSelectedYear] = useState(0)
  const [customYear, setCustomYear] = useState('')
  const [showCustomYear, setShowCustomYear] = useState(false)
  const [fetchStatus, setFetchStatus] = useState<JobStatus | null>(null)
  const [indexStatus, setIndexStatus] = useState<JobStatus | null>(null)
  const [polling, setPolling] = useState(false)
  const [dataError, setDataError] = useState('')

  const [searchMode, setSearchMode] = useState<SearchMode>('single')
  const [description, setDescription] = useState('')
  const [topK, setTopK] = useState(25)
  const [useLLM, setUseLLM] = useState(true)
  const [useChineseReason, setUseChineseReason] = useState(true)
  const [useBilingualTranslation, setUseBilingualTranslation] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [progress, setProgress] = useState<SearchProgress | null>(null)
  const [resultPapers, setResultPapers] = useState<SearchPaper[]>([])
  const [resultSummary, setResultSummary] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [importingPaperId, setImportingPaperId] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<{ stage: string; percent: number } | null>(null)

  const searchAbortRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

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

    return () => controller.abort()
  }, [loadVenues])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      searchAbortRef.current?.abort()
    }
  }, [])

  const currentVenue = useMemo(
    () => venues.find(venue => venue.name === selectedVenue),
    [selectedVenue, venues]
  )

  const selectableYears = useMemo(() => {
    const minYear = currentVenue?.min_year ?? 2024
    const thisYear = new Date().getFullYear()
    const defaultYears = minYear <= thisYear
      ? Array.from({ length: thisYear - minYear + 1 }, (_, index) => thisYear - index)
      : [minYear]
    const knownYears = currentVenue ? Object.keys(currentVenue.status).map(Number) : []

    return Array.from(new Set([...knownYears, ...defaultYears])).sort((a, b) => b - a)
  }, [currentVenue])

  const yearStatus = selectedVenue && selectedYear
    ? currentVenue?.status?.[String(selectedYear)]
    : undefined

  const preferredYear = useMemo(
    () => latestReadyYear(currentVenue, selectableYears),
    [currentVenue, selectableYears]
  )

  const isYearFetched = Boolean(
    yearStatus?.fetched || fetchStatus?.cached || fetchStatus?.status === 'done'
  )
  const isYearIndexed = Boolean(
    yearStatus?.indexed || indexStatus?.indexed || indexStatus?.status === 'done'
  )

  useEffect(() => {
    if (!selectedVenue && venues.length > 0) {
      setSelectedVenue(venues[0].name)
    }
  }, [selectedVenue, venues])

  useEffect(() => {
    if (!selectedVenue || selectedYear > 0 || showCustomYear || preferredYear === 0) {
      return
    }
    setSelectedYear(preferredYear)
  }, [preferredYear, selectedVenue, selectedYear, showCustomYear])

  const pollStatus = useCallback(async () => {
    if (!selectedVenue || !selectedYear) return

    try {
      const [nextFetchStatus, nextIndexStatus] = await Promise.all([
        searchApi.getFetchStatus(selectedVenue, selectedYear),
        searchApi.getIndexStatus(selectedVenue, selectedYear)
      ])
      if (!isMountedRef.current) return
      setFetchStatus(nextFetchStatus)
      setIndexStatus(nextIndexStatus)

      const running = nextFetchStatus.status === 'running' || nextIndexStatus.status === 'running'
      if (!running && polling) {
        setPolling(false)
        await loadVenues()
      }
    } catch (error) {
      setDataError(errorMessage(error, '检查数据状态失败'))
      setPolling(false)
    }
  }, [loadVenues, polling, selectedVenue, selectedYear])

  useEffect(() => {
    if (!selectedVenue || !selectedYear) return
    pollStatus()
  }, [pollStatus, selectedVenue, selectedYear])

  useEffect(() => {
    if (!polling) return
    const timer = window.setInterval(pollStatus, 2000)
    return () => window.clearInterval(timer)
  }, [polling, pollStatus])

  const handleYearSelect = (value: string) => {
    if (value === '__custom__') {
      setShowCustomYear(true)
      setSelectedYear(0)
      return
    }

    setShowCustomYear(false)
    setCustomYear('')
    setSelectedYear(Number(value))
    setFetchStatus(null)
    setIndexStatus(null)
  }

  const handleCustomYearConfirm = () => {
    const minYear = currentVenue?.min_year ?? 2024
    const year = Number(customYear)
    if (!Number.isInteger(year) || year < minYear || year > 2100) {
      setDataError(`年份需要在 ${minYear} 到 2100 之间`)
      return
    }

    setDataError('')
    setSelectedYear(year)
    setShowCustomYear(false)
  }

  const handleFetch = async () => {
    if (!selectedVenue || !selectedYear) return
    setDataError('')
    try {
      await searchApi.fetchPapers(selectedVenue, selectedYear, Boolean(yearStatus?.fetched))
      setPolling(true)
      await pollStatus()
    } catch (error) {
      setDataError(errorMessage(error, '获取论文失败'))
    }
  }

  const handleIndex = async () => {
    if (!selectedVenue || !selectedYear) return
    setDataError('')
    try {
      await searchApi.buildIndex(selectedVenue, selectedYear, Boolean(yearStatus?.indexed))
      setPolling(true)
      await pollStatus()
    } catch (error) {
      setDataError(errorMessage(error, '构建索引失败'))
    }
  }

  const handleSearch = async () => {
    if (!description.trim()) return

    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller

    setSearching(true)
    setSearchError('')
    setProgress(null)
    setResultPapers([])
    setResultSummary('')
    setKeywords([])

    try {
      if (searchMode === 'single') {
        const result = await searchApi.search(
          {
            venue: selectedVenue,
            year: selectedYear,
            research_description: description.trim(),
            top_k: topK,
            use_llm_eval: useLLM,
            use_chinese_relevance_reason: useChineseReason,
            use_bilingual_translation: useBilingualTranslation
          },
          setProgress,
          controller.signal
        )
        setResultPapers(result.papers)
        setResultSummary(`${selectedVenue} ${selectedYear} · ${result.total_candidates.toLocaleString()} 个候选 · ${result.papers.length} 个结果`)
        setKeywords(result.keywords)
      } else {
        const result = await searchApi.multiSearch(
          {
            research_description: description.trim(),
            auto_latest: true,
            top_k: topK,
            use_llm_eval: useLLM,
            use_chinese_relevance_reason: useChineseReason,
            use_bilingual_translation: useBilingualTranslation
          },
          setProgress,
          controller.signal
        )
        const papers = result.venues
          .flatMap(venue => venue.papers)
          .sort((a, b) => b.relevance_score - a.relevance_score)
        setResultPapers(papers)
        setResultSummary(`${result.summary.successful_venues} 个会议 · ${result.summary.returned_papers} 个结果 · ${result.summary.failed_venues} 个失败`)
        setKeywords(result.keywords)
      }
    } catch (error) {
      if (!isAbortError(error)) {
        setSearchError(errorMessage(error, '搜索失败'))
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null
      }
      setSearching(false)
      setProgress(null)
    }
  }

  const handleImport = async (paper: SearchPaper) => {
    if (importingPaperId) return

    setImportingPaperId(paper.id)
    setImportProgress({ stage: '检查是否已导入...', percent: 3 })
    setSearchError('')

    try {
      const existing = await findPaperBySource(paper.id, paper.pdf_url)
      if (existing?.id) {
        setImportProgress({ stage: '已存在，正在打开...', percent: 100 })
        setTimeout(() => onImportComplete(existing.id!), 300)
        return
      }

      setImportProgress({ stage: '正在下载 PDF...', percent: 8 })
      let downloadSource = 'direct'
      const pdfFile = await fetchPdfFile(
        paper.pdf_url,
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
          pdfUrl: paper.pdf_url,
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

      setTimeout(() => onImportComplete(paperId), 500)
    } catch (error) {
      setSearchError(errorMessage(error, '导入失败'))
      setImportingPaperId(null)
      setImportProgress(null)
    }
  }

  const canSearchSingle = Boolean(
    selectedVenue && selectedYear > 0 && description.trim().length >= 3 && isYearFetched
  )
  const canSearchMulti = description.trim().length >= 3
  const canSearch = searchMode === 'single' ? canSearchSingle : canSearchMulti
  const yearSelectValue = selectedYear || preferredYear || selectableYears[0] || ''

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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">会议</label>
                <select
                  value={selectedVenue}
                  onChange={event => {
                    setSelectedVenue(event.target.value)
                    setSelectedYear(0)
                    setFetchStatus(null)
                    setIndexStatus(null)
                    setShowCustomYear(false)
                    setCustomYear('')
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">选择会议</option>
                  {venues.map(venue => (
                    <option key={venue.name} value={venue.name}>
                      {venue.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">年份</label>
                {showCustomYear ? (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={customYear}
                      onChange={event => setCustomYear(event.target.value)}
                      onKeyDown={event => event.key === 'Enter' && handleCustomYearConfirm()}
                      className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleCustomYearConfirm}
                      className="px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <select
                    value={yearSelectValue}
                    onChange={event => handleYearSelect(event.target.value)}
                    disabled={!selectedVenue}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  >
                    {selectableYears.map(year => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                    <option value="__custom__">添加年份</option>
                  </select>
                )}
              </div>
            </div>

            {selectedVenue && selectedYear > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                  <div>
                    <div className="text-sm font-medium text-gray-700">获取论文</div>
                    <div className={`text-xs mt-1 ${statusClass(fetchStatus, yearStatus?.fetched)}`}>
                      {statusText(fetchStatus, 'fetch')}
                    </div>
                  </div>
                  <button
                    onClick={handleFetch}
                    disabled={fetchStatus?.status === 'running' || polling}
                    className="px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isYearFetched ? '重新获取' : '获取'}
                  </button>
                </div>

                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                  <div>
                    <div className="text-sm font-medium text-gray-700">构建索引</div>
                    <div className={`text-xs mt-1 ${statusClass(indexStatus, yearStatus?.indexed)}`}>
                      {statusText(indexStatus, 'index')}
                    </div>
                  </div>
                  <button
                    onClick={handleIndex}
                    disabled={!isYearFetched || indexStatus?.status === 'running' || polling}
                    className="px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isYearIndexed ? '重建' : '构建'}
                  </button>
                </div>
              </div>
            )}

            {dataError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {dataError}
              </div>
            )}
          </section>
        </div>

        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-base font-semibold text-gray-800">搜索论文</h2>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setSearchMode('single')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  searchMode === 'single'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                单会场
              </button>
              <button
                onClick={() => setSearchMode('multi')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  searchMode === 'multi'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                多会场最新
              </button>
            </div>
          </div>

          {searchMode === 'single' && selectedVenue && selectedYear > 0 && (
            <div className="mb-4">
              {!isYearFetched && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  当前会议年份需要先获取论文。
                </p>
              )}
              {isYearFetched && !isYearIndexed && (
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  已获取论文，尚未构建向量索引；搜索会退化为关键词为主。
                </p>
              )}
              {isYearFetched && isYearIndexed && (
                <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  当前会议年份已准备好。
                </p>
              )}
            </div>
          )}

          {searchMode === 'multi' && (
            <div className="mb-4 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              多会场模式会搜索每个会议已有索引的最新年份。
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
                    onChange={event => setUseLLM(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>LLM 相关性评分</span>
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
        </section>
      </div>

      <section className="bg-white border border-gray-200 rounded-lg p-5">
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
                importProgress={importingPaperId === paper.id ? importProgress || undefined : undefined}
                onImport={handleImport}
              />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-gray-400 text-sm">
            搜索结果会显示在这里。
          </div>
        )}
      </section>
    </div>
  )
}
