export function toLocalInput(iso: string): string {
  return iso.slice(0, 16)
}

export function fromLocalInput(value: string): string {
  return value ? `${value}:00Z` : ''
}
