import { useEffect, useMemo, useState, useCallback } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'

const STORAGE_KEY = 'theme-preference'

const isValidPreference = (value: string | null): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system'

const getSystemTheme = (): EffectiveTheme => {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const applyTheme = (theme: EffectiveTheme) => {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'system'
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return isValidPreference(stored) ? stored : 'system'
    } catch {
      return 'system'
    }
  })

  const effectiveTheme = useMemo<EffectiveTheme>(() => {
    if (preference === 'system') return getSystemTheme()
    return preference
  }, [preference])

  // 应用主题
  useEffect(() => {
    applyTheme(effectiveTheme)
  }, [effectiveTheme])

  // 监听系统主题变化
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (preference !== 'system') return

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light')

    // 兼容旧版 Safari
    if ('addEventListener' in mql) {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }
    // @ts-expect-error 旧版 API
    mql.addListener(handler)
    // @ts-expect-error 旧版 API
    return () => mql.removeListener(handler)
  }, [preference])

  const setThemePreference = useCallback((next: ThemePreference) => {
    setPreference(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore storage errors (e.g. private mode)
    }
  }, [])

  // 快捷切换：light <-> dark
  const toggleTheme = useCallback(() => {
    const next = effectiveTheme === 'light' ? 'dark' : 'light'
    setThemePreference(next)
  }, [effectiveTheme, setThemePreference])

  return {
    themePreference: preference,
    effectiveTheme,
    setThemePreference,
    toggleTheme,
    isDark: effectiveTheme === 'dark',
  }
}
