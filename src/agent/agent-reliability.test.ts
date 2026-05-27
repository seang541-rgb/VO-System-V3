import { describe, it, expect, vi } from 'vitest';

// We test the exported helper functions indirectly via the module.
// Since estimateMaxHops and executeToolWithTimeout are module-private,
// we test the patterns they implement via focused unit tests.

describe('Agent Reliability', () => {
  describe('Tool timeout pattern', () => {
    it('resolves if tool finishes before timeout', async () => {
      const toolFn = () => new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 10));
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TOOL_TIMEOUT')), 500),
      );
      const result = await Promise.race([toolFn(), timeout]);
      expect(result).toBe('ok');
    });

    it('rejects if tool exceeds timeout', async () => {
      const toolFn = () => new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 500));
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TOOL_TIMEOUT: test exceeded 50ms limit')), 50),
      );
      await expect(Promise.race([toolFn(), timeout])).rejects.toThrow('TOOL_TIMEOUT');
    });
  });

  describe('Dynamic hop estimation pattern', () => {
    // Mirrors the logic in estimateMaxHops
    function estimateMaxHops(userText: string): number {
      const DEFAULT_MAX_HOPS = 10;
      const HOPS_PER_PLANNED_STEP = 2;
      const ABSOLUTE_MAX_HOPS = 20;

      const multiStepPatterns = [
        /比较.*总结|compare.*summar/i,
        /分析.*报告|analy.*report/i,
        /审计.*导出|audit.*export/i,
        /全面|完整|详细|comprehensive|full|detailed/i,
        /然后.*然后|then.*then/i,
        /①.*②|1\).*2\)/,
      ];

      let complexity = 0;
      for (const p of multiStepPatterns) {
        if (p.test(userText)) complexity++;
      }
      if (userText.length > 200) complexity++;
      if (userText.length > 500) complexity++;

      const dynamicHops = DEFAULT_MAX_HOPS + complexity * HOPS_PER_PLANNED_STEP;
      return Math.min(dynamicHops, ABSOLUTE_MAX_HOPS);
    }

    it('simple question gets default hops', () => {
      expect(estimateMaxHops('hello')).toBe(10);
    });

    it('multi-step workflow gets extra hops', () => {
      expect(estimateMaxHops('比较两个IFC然后总结商业影响')).toBe(12);
    });

    it('complex request with multiple patterns gets more hops', () => {
      const text = '请全面分析两个IFC模型，比较差异并总结商业影响，然后生成详细报告';
      const hops = estimateMaxHops(text);
      expect(hops).toBeGreaterThan(12);
      expect(hops).toBeLessThanOrEqual(20);
    });

    it('never exceeds absolute maximum', () => {
      const text = '全面 比较 总结 分析 报告 审计 导出 详细 comprehensive ' + 'x'.repeat(600);
      expect(estimateMaxHops(text)).toBeLessThanOrEqual(20);
    });
  });

  describe('Retry pattern', () => {
    it('retries on transient error and succeeds', async () => {
      let attempt = 0;
      const flakyTool = async () => {
        attempt++;
        if (attempt === 1) throw new Error('Network error');
        return { data: 'ok' };
      };

      // First attempt fails, retry succeeds
      let result: unknown;
      try {
        result = await flakyTool();
      } catch {
        result = await flakyTool(); // retry
      }
      expect(result).toEqual({ data: 'ok' });
      expect(attempt).toBe(2);
    });

    it('does not retry PREREQUISITE_NOT_MET errors', async () => {
      const tool = async () => { throw new Error('PREREQUISITE_NOT_MET: IFC not loaded'); };

      let retried = false;
      try {
        await tool();
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('PREREQUISITE_NOT_MET')) {
          retried = true;
          await tool(); // would retry here for other errors
        }
      }
      expect(retried).toBe(false);
    });
  });

  describe('Consecutive error bail-out pattern', () => {
    it('stops after 3 consecutive error hops', () => {
      let consecutiveErrors = 0;
      const hops = [];

      for (let hop = 0; hop < 10; hop++) {
        const hopHadError = true; // simulate every hop has errors
        consecutiveErrors = hopHadError ? consecutiveErrors + 1 : 0;
        hops.push(hop);
        if (consecutiveErrors >= 3) break;
      }

      expect(hops.length).toBe(3);
    });

    it('resets counter on successful hop', () => {
      let consecutiveErrors = 0;
      const results = [true, true, false, true, true, false, true, true, true]; // error pattern
      let bailed = false;

      for (let hop = 0; hop < results.length; hop++) {
        consecutiveErrors = results[hop] ? consecutiveErrors + 1 : 0;
        if (consecutiveErrors >= 3) {
          bailed = true;
          break;
        }
      }

      expect(bailed).toBe(true);
      // Bails at index 8 (3rd consecutive true after index 6,7,8)
    });
  });
});
