export const COMMON_CURRENCIES = ['EUR', 'USD', 'JPY', 'GBP', 'CHF', 'NOK', 'SEK', 'DKK'] as const

export const COMMON_COUNTRY_CODES = ['NL', 'DE', 'FR', 'GB', 'JP', 'US', 'BE', 'ES', 'IT'] as const

export function optionsWithCurrent(options: readonly string[], current: string): string[] {
  return current && !options.includes(current) ? [...options, current] : [...options]
}
