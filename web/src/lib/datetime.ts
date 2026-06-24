export function toLocalInput(iso: string): string {
  const date = new Date(iso)
  if (iso === '' || Number.isNaN(date.getTime())) return iso.slice(0, 16)

  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getUTCFullYear(),
    '-',
    pad(date.getUTCMonth() + 1),
    '-',
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    ':',
    pad(date.getUTCMinutes()),
  ].join('')
}

export function fromLocalInput(value: string): string {
  return value ? `${value}:00Z` : ''
}
