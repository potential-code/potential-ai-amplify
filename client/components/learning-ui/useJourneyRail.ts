'use client'

/**
 * Desktop journey-rail visibility, shared by the three learning canvases.
 * Persisted per browser as a convenience; storage failures fall back to open.
 */

import { useCallback, useState } from 'react'

const STORAGE_KEY = 'sana-journey-open'

export function useJourneyRail(): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== '0'
    } catch {
      return true
    }
  })

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* per-viewer convenience only */
      }
      return next
    })
  }, [])

  return [open, toggle]
}
