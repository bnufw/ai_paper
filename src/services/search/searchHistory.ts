import { db } from '../storage/db'
import type { SearchHistoryRecord } from './types'

const SEARCH_HISTORY_KEY = 'search_history_records'
const SEARCH_HISTORY_LIMIT = 10

type LegacySearchHistoryRecord = Partial<SearchHistoryRecord> & {
  year?: number
}

function normalizeHistoryRecord(record: LegacySearchHistoryRecord): SearchHistoryRecord | null {
  const legacyYear = Number(record.year)
  const years = Array.isArray(record.years)
    ? record.years.map(Number).filter(Number.isFinite)
    : Number.isFinite(legacyYear) ? [legacyYear] : []

  if (!record.id || !record.createdAt || !record.query || years.length === 0) return null

  return {
    id: record.id,
    createdAt: record.createdAt,
    query: record.query,
    years,
    venues: (record.venues || []).map(venue => ({
      venue: venue.venue,
      display_name: venue.display_name || venue.venue,
      years: venue.years?.length ? venue.years : years,
      fetched: Boolean(venue.fetched),
      indexed: Boolean(venue.indexed),
      total_papers: venue.total_papers
    })),
    topK: record.topK || 25,
    useLLM: record.useLLM ?? true,
    useChineseReason: record.useChineseReason ?? true,
    useBilingualTranslation: record.useBilingualTranslation ?? false,
    resultSummary: record.resultSummary || '',
    keywords: record.keywords || [],
    papers: record.papers || []
  }
}

function parseHistory(value?: string): SearchHistoryRecord[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed
        .map(record => normalizeHistoryRecord(record))
        .filter((record): record is SearchHistoryRecord => Boolean(record))
      : []
  } catch {
    return []
  }
}

async function writeHistory(records: SearchHistoryRecord[]): Promise<void> {
  await db.settings.put({
    key: SEARCH_HISTORY_KEY,
    value: JSON.stringify(records.slice(0, SEARCH_HISTORY_LIMIT))
  })
}

export async function listSearchHistory(): Promise<SearchHistoryRecord[]> {
  const setting = await db.settings.get(SEARCH_HISTORY_KEY)
  return parseHistory(setting?.value)
}

export async function saveSearchHistory(
  record: Omit<SearchHistoryRecord, 'id' | 'createdAt'>
): Promise<SearchHistoryRecord[]> {
  const existing = await listSearchHistory()
  const nextRecord: SearchHistoryRecord = {
    ...record,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString()
  }
  const next = [nextRecord, ...existing].slice(0, SEARCH_HISTORY_LIMIT)
  await writeHistory(next)
  return next
}

export async function deleteSearchHistory(id: string): Promise<SearchHistoryRecord[]> {
  const next = (await listSearchHistory()).filter(record => record.id !== id)
  await writeHistory(next)
  return next
}

export async function clearSearchHistory(): Promise<void> {
  await db.settings.delete(SEARCH_HISTORY_KEY)
}
