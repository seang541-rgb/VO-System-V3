import { describe, it, expect } from 'vitest';
import { guardAgentOutput, hasSuspiciousContent } from './output-guard';

describe('Output Guard', () => {
  describe('guardAgentOutput', () => {
    it('passes clean text through unchanged', () => {
      const result = guardAgentOutput('Hello, this is a normal response.');
      expect(result.text).toBe('Hello, this is a normal response.');
      expect(result.modified).toBe(false);
      expect(result.flags).toHaveLength(0);
    });

    it('handles empty text', () => {
      const result = guardAgentOutput('');
      expect(result.text).toBe('');
      expect(result.modified).toBe(false);
    });

    it('sanitizes script injection', () => {
      const result = guardAgentOutput('Check this: <script>alert("xss")</script>');
      expect(result.text).not.toContain('<script');
      expect(result.modified).toBe(true);
      expect(result.flags).toContain('script_injection');
    });

    it('sanitizes javascript: protocol', () => {
      const result = guardAgentOutput('Click [here](javascript:alert(1))');
      expect(result.text).not.toContain('javascript:');
      expect(result.modified).toBe(true);
    });

    it('redacts API key leaks', () => {
      const result = guardAgentOutput('The key is sk-abcdefghijklmnopqrstuvwxyz');
      expect(result.text).toContain('[REDACTED]');
      expect(result.modified).toBe(true);
      expect(result.flags).toContain('credential_leak');
    });

    it('redacts Bearer token leaks', () => {
      const result = guardAgentOutput('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef');
      expect(result.text).toContain('[REDACTED]');
      expect(result.flags).toContain('credential_leak');
    });

    it('redacts SUPABASE_SERVICE_ROLE mention', () => {
      const result = guardAgentOutput('The SUPABASE_SERVICE_ROLE key is used for admin access');
      expect(result.text).toContain('[REDACTED]');
    });
  });

  describe('hasSuspiciousContent', () => {
    it('returns false for clean text', () => {
      expect(hasSuspiciousContent('Normal text here')).toBe(false);
    });

    it('returns true for script tags', () => {
      expect(hasSuspiciousContent('<script>bad()</script>')).toBe(true);
    });

    it('returns true for credential patterns', () => {
      expect(hasSuspiciousContent('sk-thisIsAFakeApiKeyThatIsLong')).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(hasSuspiciousContent('')).toBe(false);
    });
  });
});
