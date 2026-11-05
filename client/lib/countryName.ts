import { getCountryData, type TCountryCode } from 'countries-list'

/**
 * A country for display. Accounts made through Anna's chat before Oct 2026
 * stored the two-letter code ("AE"); everything else stores the name.
 */
export function countryName(value: string | null | undefined): string {
  if (!value) return ''
  if (/^[A-Z]{2}$/.test(value)) {
    try {
      return getCountryData(value as TCountryCode)?.name ?? value
    } catch {
      return value
    }
  }
  return value
}
