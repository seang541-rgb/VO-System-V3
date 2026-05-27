import { describe, it, expect } from 'vitest';
import { VALID_TRANSITIONS, type VoCaseStatus } from './vo-case-types';

describe('VO Case 状态机', () => {
  it('draft 只能转到 analyzing 或 cancelled', () => {
    expect(VALID_TRANSITIONS.draft).toEqual(['analyzing', 'cancelled']);
  });

  it('analyzing 只能转到 pending_review, error, cancelled', () => {
    expect(VALID_TRANSITIONS.analyzing).toEqual(['pending_review', 'error', 'cancelled']);
  });

  it('pending_review 可以 approve、打回、或取消', () => {
    expect(VALID_TRANSITIONS.pending_review).toEqual(['approved', 'revision', 'cancelled']);
  });

  it('approved 只能生成报告或取消', () => {
    expect(VALID_TRANSITIONS.approved).toEqual(['reported', 'cancelled']);
  });

  it('reported 是终态，不能转出', () => {
    expect(VALID_TRANSITIONS.reported).toEqual([]);
  });

  it('cancelled 是终态，不能转出', () => {
    expect(VALID_TRANSITIONS.cancelled).toEqual([]);
  });

  it('revision 可以重新分析或取消', () => {
    expect(VALID_TRANSITIONS.revision).toEqual(['analyzing', 'cancelled']);
  });

  it('error 可以重试回 draft 或取消', () => {
    expect(VALID_TRANSITIONS.error).toEqual(['draft', 'cancelled']);
  });

  it('所有状态都在转换表中定义', () => {
    const allStatuses: VoCaseStatus[] = [
      'draft', 'analyzing', 'pending_review',
      'approved', 'reported', 'revision',
      'cancelled', 'error',
    ];
    for (const status of allStatuses) {
      expect(VALID_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(VALID_TRANSITIONS[status])).toBe(true);
    }
  });

  it('没有自循环（状态不能转到自己）', () => {
    for (const [status, targets] of Object.entries(VALID_TRANSITIONS)) {
      expect(targets).not.toContain(status);
    }
  });

  it('终态不能被转出', () => {
    expect(VALID_TRANSITIONS.reported).toHaveLength(0);
    expect(VALID_TRANSITIONS.cancelled).toHaveLength(0);
  });

  it('审批打回后可以重新分析（revision → analyzing）', () => {
    expect(VALID_TRANSITIONS.revision).toContain('analyzing');
    expect(VALID_TRANSITIONS.analyzing).toContain('pending_review');
    // 完整回路：pending_review → revision → analyzing → pending_review
  });
});
