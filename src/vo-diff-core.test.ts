import { describe, expect, it } from 'vitest';
import { buildCommercialBreakdown, type BimComponent, type VoComparisonResults } from './vo-diff-core';

function wallComponent(): BimComponent {
  return {
    ifcId: 'wall-1',
    type: 'IfcWall',
    qsLabel: 'Brick wall',
    smm2SectionCode: 'G',
    smm2SectionTitle: 'Brickwork',
    smm2SectionSort: 'G',
    quantities: {
      NetArea: { value: 2, unit: 'm2', source: 'qto' },
    },
  } as unknown as BimComponent;
}

function addedWallResult(): VoComparisonResults {
  return {
    added: [wallComponent()],
    deleted: [],
    modified: [],
    qsSummary: {
      countedItems: 1,
      ignoredItems: 0,
      formworkAlerts: 0,
      eotFlags: 0,
      starRateCandidates: 0,
      protectedValue: 0,
    },
  } as unknown as VoComparisonResults;
}

describe('commercial pricing evidence boundary', () => {
  it('does not apply built-in project rates without a user BQ mapping', () => {
    const breakdown = buildCommercialBreakdown(addedWallResult());

    expect(breakdown.actions[0]).toEqual(expect.objectContaining({
      pricingSource: 'unmapped',
      rateStatus: 'pending',
      rate: undefined,
      amount: undefined,
    }));
    expect(breakdown.summary.netValue).toBe(0);
  });

  it('prices a row only when it is mapped to a user BQ line', () => {
    const breakdown = buildCommercialBreakdown(addedWallResult(), {
      itemsByReference: {
        'BQ/G/USER': {
          itemReference: 'BQ/G/USER',
          description: 'User verified brickwork',
          unit: 'm2',
          contractRate: 45,
        },
      },
      labelMappings: { 'Brick wall': 'BQ/G/USER' },
    });

    expect(breakdown.actions[0]).toEqual(expect.objectContaining({
      pricingSource: 'contract-bq',
      rateStatus: 'rated',
      rate: 45,
      amount: 90,
    }));
    expect(breakdown.summary.netValue).toBe(90);
  });
});
