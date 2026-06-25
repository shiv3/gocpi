export type Updater<T> = T | ((prev: T) => T)

export function applyUpdater<T>(next: Updater<T>, prev: T): T {
  return typeof next === 'function' ? (next as (prev: T) => T)(prev) : next
}
