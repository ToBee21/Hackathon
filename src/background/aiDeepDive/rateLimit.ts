export function createRateLimiter(windowMs: number) {
  const lastHit = new Map<string, number>()

  return (key: string, now = Date.now()): boolean => {
    const previous = lastHit.get(key) ?? 0
    if (now - previous < windowMs) return false
    lastHit.set(key, now)
    return true
  }
}

