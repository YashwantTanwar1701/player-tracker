// Simple in-memory cache with TTL
// Survives tab switches and re-renders but resets on page refresh
// No dependencies — works with existing Supabase setup

interface CacheEntry<T> {
  data:    T
  ts:      number
  ttl:     number  // ms
}

class MemCache {
  private store = new Map<string, CacheEntry<any>>()

  set<T>(key: string, data: T, ttlMs = 60_000) {
    this.store.set(key, { data, ts: Date.now(), ttl: ttlMs })
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() - entry.ts > entry.ttl) {
      this.store.delete(key)
      return null
    }
    return entry.data as T
  }

  invalidate(prefix: string) {
    Array.from(this.store.keys()).forEach(key => {
      if (key.startsWith(prefix)) this.store.delete(key)
    })
  }

  clear() { this.store.clear() }
}

// Singleton — shared across all components in the same browser tab
export const cache = new MemCache()

// TTLs
export const TTL = {
  TOURNAMENTS:  5 * 60_000,   // 5 min — changes rarely
  PLAYERS_LIST: 2 * 60_000,   // 2 min — changes when claimed/unclaimed
  TASKS:        1 * 60_000,   // 1 min — changes as operators work
  OVERVIEW:     3 * 60_000,   // 3 min — analytics
  COMPLETED:    5 * 60_000,   // 5 min — only grows
}
