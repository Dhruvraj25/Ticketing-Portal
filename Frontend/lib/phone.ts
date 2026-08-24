/**
 * Phone + country helpers shared across the app (Profile, Customer Onboarding).
 *
 * The country list is derived from libphonenumber-js metadata (complete, always
 * in sync with real dial codes) instead of a hand-maintained partial list.
 * Country names come from the built-in Intl.DisplayNames API (no data file).
 */

import {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js'

export interface CountryOption {
  iso2: string
  name: string
  dialCode: string
  flag: string
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

/** Convert an ISO-3166 alpha-2 code to a flag emoji (e.g. 'IN' → 🇮🇳). */
export function flagEmoji(iso2: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso2)) return ''
  return iso2
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)))
}

let cachedOptions: CountryOption[] | null = null

/** Complete, sorted list of countries with flag, name, and dial code. */
export function getCountryOptions(): CountryOption[] {
  if (cachedOptions) return cachedOptions
  cachedOptions = getCountries()
    .map((iso2) => ({
      iso2,
      name: regionNames.of(iso2) || iso2,
      dialCode: getCountryCallingCode(iso2),
      flag: flagEmoji(iso2),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return cachedOptions
}

/** Dial code without the '+', e.g. 'IN' → '91'. Returns '' for unknown codes. */
export function getCountryDialCode(iso2?: string | null): string {
  if (!iso2) return ''
  try {
    return getCountryCallingCode(iso2 as CountryCode)
  } catch {
    return ''
  }
}

/**
 * Validate a national phone number against the selected country.
 * Empty values return false — callers decide whether the field is required.
 */
export function isValidPhoneForCountry(phone: string, iso2?: string | null): boolean {
  const raw = (phone || '').trim()
  if (!raw) return false
  try {
    return isValidPhoneNumber(raw, (iso2 || undefined) as CountryCode | undefined)
  } catch {
    return false
  }
}


