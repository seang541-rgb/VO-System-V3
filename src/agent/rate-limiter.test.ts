import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000, cooldownMs: 5000 });
    for (let i = 0; i < 5; i++) {
      const result = limiter.check();
      expect(result.allowed).toBe(true);
      limiter.record();
    }
  });

  it('blocks requests over the limit', () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60000, cooldownMs: 5000 });
    for (let i = 0; i < 3; i++) {
      limiter.acquire();
    }
    const result = limiter.check();
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.reason).toContain('Rate limit');
    }
  });

  it('acquire throws when limit exceeded', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000, cooldownMs: 5000 });
    limiter.acquire();
    limiter.acquire();
    expect(() => limiter.acquire()).toThrow('Rate limit');
  });

  it('reset clears state', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000, cooldownMs: 5000 });
    limiter.acquire();
    limiter.acquire();
    expect(limiter.check().allowed).toBe(false);
    limiter.reset();
    expect(limiter.check().allowed).toBe(true);
  });
});
