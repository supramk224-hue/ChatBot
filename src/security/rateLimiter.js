export class RateLimiter {
  constructor({ windowMs = 60_000, maxRequests = 20, now = () => Date.now() } = {}) {
    if (windowMs <= 0 || maxRequests <= 0) {
      throw new RangeError('windowMs and maxRequests must be greater than zero.');
    }

    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.now = now;
    this.hits = new Map();
  }

  check(key) {
    if (!key) {
      throw new TypeError('RateLimiter.check requires a user or session key.');
    }

    const timestamp = this.now();
    const windowStart = timestamp - this.windowMs;
    const recent = (this.hits.get(key) || []).filter((hit) => hit > windowStart);

    if (recent.length >= this.maxRequests) {
      this.hits.set(key, recent);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, recent[0] + this.windowMs - timestamp),
      };
    }

    recent.push(timestamp);
    this.hits.set(key, recent);
    return {
      allowed: true,
      remaining: this.maxRequests - recent.length,
      retryAfterMs: 0,
    };
  }

  reset(key) {
    if (key == null) {
      this.hits.clear();
      return;
    }
    this.hits.delete(key);
  }
}
