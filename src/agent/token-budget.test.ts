import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateMessageTokens,
  truncateToolResult,
  compressMessages,
  getBudgetStatus,
} from './token-budget';
import type { OpenAIMessage } from './agent-client';

describe('Token Budget', () => {
  describe('estimateTokens', () => {
    it('空字符串返回 0', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('纯 ASCII 按 4 chars/token 估算', () => {
      const text = 'Hello world'; // 11 chars
      expect(estimateTokens(text)).toBe(Math.ceil(11 / 4)); // 3
    });

    it('中文按 1.5 chars/token 估算', () => {
      const text = '你好世界'; // 4 CJK chars
      expect(estimateTokens(text)).toBe(Math.ceil(4 / 1.5)); // 3
    });

    it('混合中英文', () => {
      const text = 'Hello 世界'; // 6 ASCII + 2 CJK
      const expected = Math.ceil(6 / 4 + 2 / 1.5);
      expect(estimateTokens(text)).toBe(expected);
    });
  });

  describe('estimateMessageTokens', () => {
    it('user 消息包含 overhead', () => {
      const msg: OpenAIMessage = { role: 'user', content: 'test' };
      const tokens = estimateMessageTokens(msg);
      expect(tokens).toBeGreaterThan(4); // 至少有 overhead
    });

    it('带 tool_calls 的消息', () => {
      const msg: OpenAIMessage = {
        role: 'assistant',
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'query_ifc', arguments: '{"model":"base"}' },
        }],
      };
      const tokens = estimateMessageTokens(msg);
      expect(tokens).toBeGreaterThan(10);
    });
  });

  describe('truncateToolResult', () => {
    it('短结果不截断', () => {
      const content = '{"ok": true}';
      expect(truncateToolResult(content)).toBe(content);
    });

    it('超大 components 数组被截断', () => {
      // Each component needs enough data so total JSON exceeds MAX_TOOL_RESULT_CHARS (8000)
      const components = Array.from({ length: 50 }, (_, i) => ({
        id: i, name: `component_${i}`, description: 'x'.repeat(200),
      }));
      const content = JSON.stringify({ model: 'base', total: 50, matched: 50, components });
      const truncated = truncateToolResult(content);
      const parsed = JSON.parse(truncated);
      expect(parsed.components.length).toBe(10);
      expect(parsed._truncated).toBe(true);
      expect(parsed._originalCount).toBe(50);
    });

    it('纯文本超长被截断', () => {
      const content = 'x'.repeat(20000);
      const truncated = truncateToolResult(content);
      expect(truncated.length).toBeLessThan(content.length);
      expect(truncated).toContain('truncated');
    });
  });

  describe('compressMessages', () => {
    it('短对话不压缩', () => {
      const messages: OpenAIMessage[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ];
      const result = compressMessages(messages);
      expect(result).toEqual(messages);
    });

    it('长对话压缩早期轮次', () => {
      // Each message ~5000 chars ≈ 1250 tokens, 40 messages ≈ 50000 tokens > threshold 21250
      const messages: OpenAIMessage[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push({ role: 'user', content: `Question ${i}: ${'x'.repeat(5000)}` });
        messages.push({
          role: 'assistant',
          content: `Answer ${i}: ${'y'.repeat(5000)}`,
        });
      }
      const result = compressMessages(messages);
      // 压缩后应该更短
      expect(result.length).toBeLessThan(messages.length);
      // 最后几轮应该保留完整
      const lastMsg = result[result.length - 1];
      expect(lastMsg.content).toContain('Answer 19');
    });
  });

  describe('getBudgetStatus', () => {
    it('空消息', () => {
      const status = getBudgetStatus([]);
      expect(status.currentTokens).toBe(0);
      expect(status.utilization).toBe(0);
      expect(status.needsCompression).toBe(false);
    });

    it('正常使用', () => {
      const messages: OpenAIMessage[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ];
      const status = getBudgetStatus(messages);
      expect(status.currentTokens).toBeGreaterThan(0);
      expect(status.utilization).toBeLessThan(0.1);
      expect(status.needsCompression).toBe(false);
    });
  });
});
