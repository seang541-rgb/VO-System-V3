import { describe, it, expect } from 'vitest';
import { parsePlan, advancePlan, matchToolToStep } from './planner';

describe('Planner', () => {
  describe('parsePlan', () => {
    it('returns null for short/empty text', () => {
      expect(parsePlan('')).toBeNull();
      expect(parsePlan('ok')).toBeNull();
    });

    it('parses circled number steps (①②③)', () => {
      const text = '我来帮你分析：① 比较两个IFC模型 ② 总结商业影响 ③ 导出Excel报告';
      const plan = parsePlan(text);
      expect(plan).not.toBeNull();
      expect(plan!.totalSteps).toBe(3);
      expect(plan!.steps[0]).toContain('比较');
    });

    it('parses numbered list steps (1. 2. 3.)', () => {
      const text = `Let me help you:\n1. Compare the IFC files\n2. Summarize commercial impact\n3. Generate the report`;
      const plan = parsePlan(text);
      expect(plan).not.toBeNull();
      expect(plan!.totalSteps).toBe(3);
    });

    it('parses Step N: format', () => {
      const text = 'Step 1: Load the model\nStep 2: Run the audit\nStep 3: Export results';
      const plan = parsePlan(text);
      expect(plan).not.toBeNull();
      expect(plan!.totalSteps).toBe(3);
    });

    it('returns null for text without clear steps', () => {
      const text = 'I will help you with the IFC comparison and provide a summary of the changes.';
      expect(parsePlan(text)).toBeNull();
    });
  });

  describe('advancePlan', () => {
    it('advances current step by 1', () => {
      const plan = { steps: ['a', 'b', 'c'], totalSteps: 3, currentStep: 0 };
      const advanced = advancePlan(plan, 'some_tool');
      expect(advanced.currentStep).toBe(1);
    });

    it('does not exceed totalSteps - 1', () => {
      const plan = { steps: ['a', 'b'], totalSteps: 2, currentStep: 1 };
      const advanced = advancePlan(plan, 'some_tool');
      expect(advanced.currentStep).toBe(1);
    });
  });

  describe('matchToolToStep', () => {
    it('matches compare_ifc to a comparison step', () => {
      const plan = {
        steps: ['比较IFC模型', '总结商业影响', '导出报告'],
        totalSteps: 3,
        currentStep: 0,
      };
      expect(matchToolToStep(plan, 'compare_ifc')).toBe(0);
    });

    it('matches summarize_commercial_impact to summary step', () => {
      const plan = {
        steps: ['比较IFC模型', '总结商业影响', '导出报告'],
        totalSteps: 3,
        currentStep: 1,
      };
      expect(matchToolToStep(plan, 'summarize_commercial_impact')).toBe(1);
    });

    it('returns -1 when no step matches', () => {
      const plan = {
        steps: ['加载模型', '运行审计'],
        totalSteps: 2,
        currentStep: 0,
      };
      expect(matchToolToStep(plan, 'ocr_document')).toBe(-1);
    });
  });
});
