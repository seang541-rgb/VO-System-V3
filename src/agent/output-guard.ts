// ── Output Guard — Agent 输出安全校验 ─────────────────────────────────────────
//
// Sanitize agent text before rendering to the user.
// Guards against: XSS injection, sensitive data leaks, prompt leaking.

/** Patterns that should never appear in agent output */
const DANGEROUS_PATTERNS: { pattern: RegExp; replacement: string; reason: string }[] = [
  // Script injection
  { pattern: /<script[\s>]/gi, replacement: '&lt;script', reason: 'script_injection' },
  { pattern: /javascript:/gi, replacement: 'javascript：', reason: 'js_protocol' },
  { pattern: /on\w+\s*=/gi, replacement: '[event]= ', reason: 'event_handler' },

  // Data URI (can embed executable content)
  { pattern: /data:\s*text\/html/gi, replacement: 'data：text/html', reason: 'data_uri' },

  // Markdown-based XSS attempts
  { pattern: /\[([^\]]*)\]\(javascript:/gi, replacement: '[$1](blocked:', reason: 'md_xss' },
];

/** Patterns that indicate the model leaked system prompt or internal data */
const LEAK_PATTERNS: RegExp[] = [
  /SYSTEM_PROMPT\s*=/i,
  /NVIDIA_NIM_API_KEY/i,
  /SUPABASE_SERVICE_ROLE/i,
  /access_token["']?\s*[:=]\s*["']ey/i,
  /Bearer\s+ey[A-Za-z0-9_-]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,  // API keys
];

export interface GuardResult {
  /** Sanitized text safe for rendering */
  text: string;
  /** Whether any content was modified */
  modified: boolean;
  /** Reasons for modifications */
  flags: string[];
}

/**
 * Sanitize agent output text.
 * Returns the cleaned text and any flags indicating what was caught.
 */
export function guardAgentOutput(raw: string): GuardResult {
  if (!raw) return { text: '', modified: false, flags: [] };

  let text = raw;
  const flags: string[] = [];

  // Check and replace dangerous patterns
  for (const { pattern, replacement, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) {
      flags.push(reason);
      text = text.replace(pattern, replacement);
    }
  }

  // Check for system prompt / credential leaks
  for (const p of LEAK_PATTERNS) {
    if (p.test(text)) {
      flags.push('credential_leak');
      // Redact the entire match
      text = text.replace(p, '[REDACTED]');
    }
  }

  return {
    text,
    modified: flags.length > 0,
    flags,
  };
}

/**
 * Quick check if text contains anything suspicious.
 * Lighter than full guardAgentOutput — use for fast pre-screening.
 */
export function hasSuspiciousContent(text: string): boolean {
  if (!text) return false;
  for (const { pattern } of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  for (const p of LEAK_PATTERNS) {
    if (p.test(text)) return true;
  }
  return false;
}
