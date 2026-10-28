'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/store/themeStore'

/**
 * Applies the current theme on mount and syncs changes.
 * Call this once in your root layout or editor component.
 */
export function useTheme() {
  const { theme, toggleTheme, setTheme } = useThemeStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return { theme, toggleTheme, setTheme }
}
