import { describe, it, expect } from 'vitest';
import type { BimComponent, BqLineItem, VoCommercialAction } from '../BimEngine';
import {
  buildBqMappingContext,
  guessUnitBySection,
  buildSystemUnitMismatchMessage,
  formatElementLabel,
  getActionChanges,
  formatCurrencyValue,
  formatSignedCurrencyValue,
  formatQuantityValue,
  formatQuantitySource,
  formatQuantityRisk,
  modelStateLabel,
  summarizeLabels,
} from './format';

describe('guessUnitBySection', () => {
  it('F → m3', () => expect(guessUnitBySection('F')).toBe('m3'));
  it('G → m2', () => expect(guessUnitBySection('G')).toBe('m2'));
  it('M → m2', () => expect(guessUnitBySection('M')).toBe('m2'));
  it('Q → nr', () => expect(guessUnitBySection('Q')).toBe('nr'));
  it('U → nr', () => expect(guessUnitBySection('U')).toBe('nr'));
  it('unknown → empty string', () => expect(guessUnitBySection('Z')).toBe(''));
});

describe('buildSystemUnitMismatchMessage', () => {
  it('includes both units', () => {
    const msg = buildSystemUnitMismatchMessage('m3', 'm2');
    expect(msg).toContain('m3');
    expect(msg).toContain('m2');
  });
  it('handles empty units with dash', () => {
    const msg = buildSystemUnitMismatchMessage('', '');
    expect(msg).toContain('-');
  });
});

describe('formatElementLabel', () => {
  it('returns qsLabel when present', () => expect(formatElementLabel({ qsLabel: 'My Wall' })).toBe('My Wall'));
  it('falls back to name', () => expect(formatElementLabel({ name: 'Wall 200mm' })).toBe('Wall 200mm'));
  it('falls back to type', () => expect(formatElementLabel({ type: 'IfcWall' })).toBe('IfcWall'));
  it('returns Unknown element for null', () => expect(formatElementLabel(null)).toBe('Unknown element'));
  it('returns Unknown element for undefined', () => expect(formatElementLabel(undefined)).toBe('Unknown element'));
});

describe('getActionChanges', () => {
  it('returns changes array', () => {
    expect(getActionChanges({ changes: [1, 2, 3] } as unknown as Partial<VoCommercialAction>)).toEqual([1, 2, 3]);
  });
  it('returns empty array for null', () => expect(getActionChanges(null)).toEqual([]));
  it('returns empty array when no changes', () => expect(getActionChanges({} as Partial<VoCommercialAction>)).toEqual([]));
});

describe('formatCurrencyValue', () => {
  it('formats with RM symbol and 2 decimals', () => expect(formatCurrencyValue(1234.5)).toBe('RM 1234.50'));
  it('formats zero', () => expect(formatCurrencyValue(0)).toBe('RM 0.00'));
});

describe('formatSignedCurrencyValue', () => {
  it('positive value', () => expect(formatSignedCurrencyValue(100)).toBe('RM 100.00'));
  it('negative value gets minus prefix', () => expect(formatSignedCurrencyValue(-50)).toBe('-RM 50.00'));
  it('zero', () => expect(formatSignedCurrencyValue(0)).toBe('RM 0.00'));
});

describe('formatQuantityValue', () => {
  it('formats finite quantity to 4 decimals', () => {
    expect(formatQuantityValue({ quantity: 12.5 } as VoCommercialAction)).toBe('12.5000');
  });
  it('returns 0.0000 for non-finite', () => {
    expect(formatQuantityValue({ quantity: NaN } as VoCommercialAction)).toBe('0.0000');
  });
});

describe('formatQuantitySource', () => {
  it('qto → Qto', () => expect(formatQuantitySource({ quantitySource: 'qto' } as VoCommercialAction)).toBe('Qto'));
  it('type-qto → Qto', () => expect(formatQuantitySource({ quantitySource: 'type-qto' } as VoCommercialAction)).toBe('Qto'));
  it('geometry → Geometry', () => expect(formatQuantitySource({ quantitySource: 'geometry' } as VoCommercialAction)).toBe('Geometry'));
  it('bbox → BBox Estimate', () => expect(formatQuantitySource({ quantitySource: 'bbox' } as VoCommercialAction)).toBe('BBox Estimate'));
  it('unknown → Derived', () => expect(formatQuantitySource({ quantitySource: 'other' } as unknown as VoCommercialAction)).toBe('Derived'));
});

describe('formatQuantityRisk', () => {
  it('returns dash when no risk', () => expect(formatQuantityRisk({ quantityRisk: null } as unknown as VoCommercialAction)).toBe('-'));
  it('formats risk message and reason', () => {
    const action = { quantityRisk: { message: 'High risk', reason: 'BBox fallback' } } as unknown as VoCommercialAction;
    expect(formatQuantityRisk(action)).toBe('High risk | BBox fallback');
  });
});

describe('modelStateLabel', () => {
  it('loading', () => expect(modelStateLabel('loading', 0, null)).toBe('Parsing...'));
  it('error', () => expect(modelStateLabel('error', 0, null)).toBe('Load failed'));
  it('ready with count', () => expect(modelStateLabel('ready', 42, null)).toBe('42 indexed elements'));
  it('idle with fileName', () => expect(modelStateLabel('idle', 0, 'model.ifc')).toBe('model.ifc'));
  it('idle no file', () => expect(modelStateLabel('idle', 0, null)).toBe('Not loaded'));
});

describe('summarizeLabels', () => {
  it('empty array', () => expect(summarizeLabels([])).toBe(''));
  it('within limit', () => expect(summarizeLabels(['a', 'b'])).toBe('a | b'));
  it('exceeds limit adds ellipsis', () => expect(summarizeLabels(['a', 'b', 'c', 'd'])).toBe('a | b | c ...'));
  it('custom limit', () => expect(summarizeLabels(['a', 'b', 'c'], 2)).toBe('a | b ...'));
  it('exact limit no ellipsis', () => expect(summarizeLabels(['a', 'b', 'c'], 3)).toBe('a | b | c'));
});

describe('buildBqMappingContext', () => {
  it('returns undefined for empty items', () => {
    expect(buildBqMappingContext([], {})).toBeUndefined();
  });
  it('builds context with items indexed by reference', () => {
    const items: BqLineItem[] = [{ itemReference: 'A1', description: 'test', unit: 'm2', contractRate: 100 }];
    const ctx = buildBqMappingContext(items, { wall: 'A1' });
    expect(ctx).toBeDefined();
    expect(ctx!.itemsByReference['A1']).toBeDefined();
    expect(ctx!.labelMappings).toEqual({ wall: 'A1' });
  });
});
