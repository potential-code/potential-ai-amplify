'use client'

import { useState, useRef, useEffect } from 'react'
import { getCountryDataList } from 'countries-list'
import { Check, Globe, Loader2 } from 'lucide-react'

interface CountryPickerCardProps {
  respond: (value: { countryName: string; countryCode: string }) => void
  status: 'inProgress' | 'executing' | 'complete'
}

type CountryEntry = {
  name: string
  code: string
}

const ALL_COUNTRIES: CountryEntry[] = getCountryDataList()
  .map((c) => ({ name: c.name, code: c.iso2 }))
  .sort((a, b) => a.name.localeCompare(b.name))

export function CountryPickerCard({ respond, status }: CountryPickerCardProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CountryEntry | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const respondedRef = useRef(false)
  const lastSelectedRef = useRef<CountryEntry | null>(null)

  // Only disable after the user has responded (respondedRef) or the action completed.
  // CopilotKit can start renderAndWaitForResponse in 'executing' state before the
  // user interacts, so we cannot rely on status === 'executing' alone.
  const isDisabled = status === 'complete' || respondedRef.current
  const showSpinner = respondedRef.current && status === 'executing'

  const filtered = query.trim()
    ? ALL_COUNTRIES.filter((c) =>
        c.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : ALL_COUNTRIES

  useEffect(() => {
    if (status === 'inProgress') {
      inputRef.current?.focus()
    }
  }, [status])

  useEffect(() => {
    if (status === 'inProgress') {
      setSelected(null)
      setQuery('')
      respondedRef.current = false
    }
  }, [status])

  function handleSelect(country: CountryEntry) {
    if (isDisabled || respondedRef.current) return
    respondedRef.current = true
    lastSelectedRef.current = country
    setSelected(country)
    respond({ countryName: country.name, countryCode: country.code })
  }

  return (
    <div className="my-2 w-full max-w-[340px] overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface text-ui-text">
      <div className="flex items-center gap-2.5 border-b border-ui-line px-4 py-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ui-brand-soft text-ui-brand-text">
          <Globe className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="text-sm font-semibold">Select your country</span>
      </div>

      {status === 'complete' ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ui-ok-soft text-ui-ok">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="text-sm font-medium">{lastSelectedRef.current?.name ?? 'Country selected'}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isDisabled}
              placeholder="Search countries"
              aria-label="Search countries"
              className="h-10 w-full rounded-[10px] border border-ui-line bg-ui-surface px-3 text-sm text-ui-text outline-none transition-[border-color,box-shadow] placeholder:text-ui-muted focus:border-ui-brand focus:ring-[3px] focus:ring-ui-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
            />
            {showSpinner && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-ui-brand-text" aria-hidden />
              </div>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ui-muted">No countries found.</p>
            ) : (
              filtered.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelect(country)}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-ui-text transition-colors hover:bg-ui-surface-2 disabled:cursor-not-allowed"
                >
                  {country.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
