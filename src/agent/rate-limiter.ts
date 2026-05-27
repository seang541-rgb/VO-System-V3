// ── Rate Limiter — 客户端请求限流 ─────────────────────────────────────────────
//
// Sliding-window rate limiter for agent proxy calls.
// Prevents accidental rapid-fire requests that waste credits.

export interface RateLimiterConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Cooldown period after limit is hit (ms) */
  cooldownMs: number;
}

export type RateLimitResult =
  | { allowed: true; retryAfterMs?: undefined; reason?: undefined }
  | { allowed: false; retryAfterMs: number; reason: string };

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequests: 10,      // 10 requests
  windowMs: 60_000,     // per minute
  cooldownMs: 10_000,   // 10s cooldown when limit hit
};

export class RateLimiter {
  private timestamps: number[] = [];
  private cooldownUntil = 0;
  private config: RateLimiterConfig;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a request is allowed.
   * Returns { allowed: true } or { allowed: false, retryAfterMs, reason }.
   */
  check(): RateLimitResult {
    const now = Date.now();

    // Check cooldown
    if (now < this.cooldownUntil) {
      return {
        allowed: false,
        retryAfterMs: this.cooldownUntil - now,
        reason: `Rate limit cooldown active. Please wait ${Math.ceil((this.cooldownUntil - now) / 1000)}s.`,
      };
    }

    // Slide window — remove timestamps older than windowMs
    const windowStart = now - this.config.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > windowStart);

    // Check if under limit
    if (this.timestamps.length >= this.config.maxRequests) {
      this.cooldownUntil = now + this.config.cooldownMs;
      const oldestInWindow = this.timestamps[0];
      const retryAfterMs = Math.max(this.config.cooldownMs, oldestInWindow + this.config.windowMs - now);
      return {
        allowed: false,
        retryAfterMs,
        reason: `Rate limit reached (${this.config.maxRequests} requests per ${this.config.windowMs / 1000}s). Cooling down.`,
      };
    }

    return { allowed: true as const };
  }

  /**
   * Record a request. Call this AFTER check() returns allowed: true.
   */
  record(): void {
    this.timestamps.push(Date.now());
  }

  /**
   * Check + record in one call. Throws if not allowed.
   */
  acquire(): void {
    const result = this.check();
    if (!result.allowed) {
      throw new Error(result.reason);
    }
    this.record();
  }

  /** Reset the limiter (e.g. on session reset) */
  reset(): void {
    this.timestamps = [];
    this.cooldownUntil = 0;
  }
}
