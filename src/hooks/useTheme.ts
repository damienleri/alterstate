import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

export function useTheme() {
  // Always start with 'light' to match server render and avoid hydration mismatch
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  // Initialize theme from localStorage/system preference after mount
  useEffect(() => {
    setMounted(true)
    
    const stored = localStorage.getItem('theme') as Theme | null
    
    let initialTheme: Theme = 'light'
    if (stored === 'light' || stored === 'dark') {
      initialTheme = stored
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      initialTheme = prefersDark ? 'dark' : 'light'
    }
    
    setTheme(initialTheme)
  }, [])

  // Apply theme to document root (only update if different from current)
  useEffect(() => {
    if (!mounted) {
      return
    }
    
    const root = window.document.documentElement
    const currentTheme = root.classList.contains('dark') ? 'dark' : 'light'
    
    if (currentTheme !== theme) {
      root.classList.remove('light', 'dark')
      root.classList.add(theme)
    }
    
    localStorage.setItem('theme', theme)
  }, [theme, mounted])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  return { theme, toggleTheme, mounted }
}

