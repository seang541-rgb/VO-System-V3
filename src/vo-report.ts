import * as XLSX from 'xlsx';
import {
  BimComponent,
  BqLineItem,
  BqMappingContext,
  ModifiedBimComponent,
  VoCommercialAction,
  VoComparisonResults,
  buildCommercialBreakdown,
} from './vo-diff-core';
import { PROJECT_QS_OVERRIDES } from './qs-project-config';
import { StarRateBuildUpRule } from './qs-config';
import { recommendBqMatches } from './bq-tools';

export interface VoReportContext {
  baseModelName?: string;
  revisionModelName?: string;
  pricingContext?: BqMappingContext;
}

function formatCurrencyValue(value: number) {
  return `${PROJECT_QS_OVERRIDES.currencySymbol} ${value.toFixed(2)}`;
}

function formatSignedCurrencyValue(value: number) {
  const rendered = `${PROJECT_QS_OVERRIDES.currencySymbol} ${Math.abs(value).toFixed(2)}`;
  return value < 0 ? `-${rendered}` : rendered;
}

function formatRateValue(action: VoCommercialAction) {
  if (action.rateStatus === 'forced-star-rate') return 'Item Not Found in BQ - Forced Star Rate';
  if (action.rateStatus !== 'rated' || typeof action.rate !== 'number') return 'Pending';
  return `${formatCurrencyValue(action.rate)} / ${action.unit}`;
}

function formatAmountValue(action: VoCommercialAction) {
  if (action.rateStatus === 'forced-star-rate') return 'Forced Star Rate';
  if (action.rateStatus !== 'rated' || typeof action.amount !== 'number') return 'Pending';
  return formatSignedCurrencyValue(action.amount);
}


function formatQuantitySource(action: VoCommercialAction) {
  switch (action.quantitySource) {
    case 'qto':
    case 'type-qto':
      return 'Qto';
    case 'geometry':
      return 'Geometry';
    case 'bbox':
      return 'BBox Estimate';
    default:
      return 'Derived';
  }
}

function formatQuantityRisk(action: VoCommercialAction) {
  if (!action.quantityRisk) return '-';
  return `${action.quantityRisk.message} | ${action.quantityRisk.reason}`;
}

function formatPricingSource(action: VoCommercialAction) {
  switch (action.pricingSource) {
    case 'contract-bq':
      return 'Contract BQ';
    case 'project-rate':
      return 'Project Rate';
    case 'unit-mismatch':
      return 'BQ Unit Mismatch';
    case 'forced-star-rate':
      return 'Forced Star Rate';
    default:
      return 'Unmapped';
  }
}

function formatElementLabel(component: BimComponent) {
  return component.qsLabel || component.name || component.type;
}

function formatOpeningLink(component: BimComponent) {
  if (component.isOpening) {
    const hostBits = [component.openingHostType, component.openingHostName || component.openingHostIfcId]
      .filter(Boolean)
      .join(' ');
    return hostBits ? `Opening -> ${hostBits}` : 'Opening -> Unassigned host';
  }

  if (component.openingCount > 0 || component.openingSignature) {
    return component.openingSignature
      ? `Host -> ${component.openingSignature}`
      : `Host -> ${component.openingCount} opening(s)`;
  }

  return '-';
}

function formatChangeLine(change: ModifiedBimComponent['changes'][number]) {
  const deltaText = typeof change.delta === 'number' && Number.isFinite(change.delta)
    ? ` | delta ${change.delta.toFixed(4)}${change.unit ? ` ${change.unit}` : ''}`
    : '';
  const qsText = change.qsImpact === 'ignored'
    ? ` | QS ignored: ${change.qsReason ?? 'Rule filtered'}`
    : ' | QS counted';
  const protectedQtyText = typeof change.protectedQuantity === 'number' && Number.isFinite(change.protectedQuantity)
    ? ` | protected ${change.protectedQuantity.toFixed(4)}${change.protectedUnit ? ` ${change.protectedUnit}` : ''}`
    : '';
  const protectedValueText = typeof change.protectedValue === 'number' && Number.isFinite(change.protectedValue)
    ? ` | protected value ${formatCurrencyValue(change.protectedValue)}`
    : change.qsImpact === 'ignored' && typeof change.protectedQuantity === 'number'
      ? ' | protected value rate required'
      : '';

  return `${change.label}: ${change.before} -> ${change.after}${deltaText}${qsText}${protectedQtyText}${protectedValueText}`;
}

function formatMeasurementRule(action: VoCommercialAction) {
  if (action.measurementRuleLabel && action.measurementRuleId) {
    return `${action.measurementRuleLabel} [${action.measurementRuleId}]`;
  }
  return action.measurementRuleLabel || action.measurementRuleId || 'Fallback measurement rule';
}

function formatCommercialBasis(action: VoCommercialAction) {
  const qty = `${action.quantityLabel}${action.measurementNote ? ` ${action.measurementNote}` : ''}: ${action.quantity.toFixed(4)} ${action.unit}`;
  const rule = `Rule: ${formatMeasurementRule(action)}`;
  if (action.rateStatus === 'rated' && typeof action.rate === 'number' && typeof action.amount === 'number') {
    return `${qty} | ${rule} @ ${formatCurrencyValue(action.rate)} / ${action.unit} = ${formatSignedCurrencyValue(action.amount)} (${action.rateLabel})`;
  }

  return `${qty} | ${rule} | rate pending (${action.rateLabel})`;
}

function formatCommercialDetail(action: VoCommercialAction) {
  const basisLine = `Commercial basis: ${formatCommercialBasis(action)}`;
  const protectionLine = action.protectedValue > 0
    ? `Protected Value: ${formatCurrencyValue(action.protectedValue)} (Saved by SMM2 Rule).`
    : '';

  if (action.sourceStatus === 'Modified' && action.action === 'Omission' && action.quantity === 0 && action.protectedValue > 0) {
    return [
      basisLine,
      'Shielded non-deduction: omission quantity reduced to 0 for commercial counting.',
      protectionLine,
      action.changes.map(formatChangeLine).join(' | '),
    ]
      .filter(Boolean)
      .join(' | ');
  }

  if (action.sourceStatus === 'Modified' && action.action === 'Omission') {
    const counterpart = action.counterpart ? formatElementLabel(action.counterpart) : 'revision item';
    return [
      basisLine,
      `Omit original contract item. Counterpart addition: ${counterpart}.`,
      protectionLine,
      action.changes.map(formatChangeLine).join(' | '),
    ]
      .filter(Boolean)
      .join(' | ');
  }

  if (action.sourceStatus === 'Modified' && action.action === 'Addition') {
    const counterpart = action.counterpart ? formatElementLabel(action.counterpart) : 'base item';
    return `${basisLine} | Add revised item. Replaces omitted base item: ${counterpart}. | ${action.changes.map(formatChangeLine).join(' | ')}`;
  }

  if (action.sourceStatus === 'Added') return `${basisLine} | Addition from revision model.`;
  if (action.sourceStatus === 'Deleted') return `${basisLine} | Omission from base contract item.`;
  return basisLine;
}

function formatShieldSummary(action: VoCommercialAction) {
  if (action.sourceStatus === 'Modified' && action.action === 'Omission') {
    const ignoredChange = action.changes.find((change) => change.qsImpact === 'ignored');
    if (ignoredChange) return ignoredChange.qsRuleId ? `Ignored (${ignoredChange.qsRuleId})` : 'Ignored';
    return '-';
  }

  if (action.sourceStatus === 'Modified' && action.action === 'Addition') {
    return 'Counted';
  }

  const component = action.component;
  if (component.isOpening) return 'Opening change';
  if (component.openingCount > 0) return 'Host openings tracked';
  return '-';
}

function formatProtectedQuantity(action: VoCommercialAction) {
  if (action.action !== 'Omission') return '-';
  const protectedParts = action.changes
    .filter((change) => typeof change.protectedQuantity === 'number' && Number.isFinite(change.protectedQuantity))
    .map((change) => `${change.protectedQuantity!.toFixed(4)}${change.protectedUnit ? ` ${change.protectedUnit}` : ''}`);
  return protectedParts.length > 0 ? protectedParts.join(' | ') : '-';
}

function formatProtectedValue(action: VoCommercialAction) {
  if (action.action !== 'Omission') return '-';
  if (action.protectedValue > 0) return formatCurrencyValue(action.protectedValue);

  const hasProtectedQty = action.changes.some((change) => typeof change.protectedQuantity === 'number' && Number.isFinite(change.protectedQuantity));
  return hasProtectedQty ? 'Rate needed' : '-';
}

function formatFormworkAlert(action: VoCommercialAction) {
  if (action.action !== 'Addition' || !action.formworkAlert) return '-';
  return `${action.formworkAlert.message} | ${action.formworkAlert.reason}`;
}

function formatStarRateCandidate(action: VoCommercialAction) {
  if (action.action !== 'Addition' || !action.starRateCandidate) return '-';
  return `${action.starRateCandidate.title} | ${action.starRateCandidate.recommendedAction}`;
}

function formatEotFlag(action: VoCommercialAction) {
  if (action.action !== 'Addition' || !action.eotFlag) return '-';
  return `${action.eotFlag.title} | ${action.eotFlag.recommendedAction}`;
}

function formatTimestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function formatPercentValue(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function buildRows(results: VoComparisonResults, pricingContext?: BqMappingContext) {
  return buildCommercialBreakdown(results, pricingContext);
}

function buildStarRateCorpus(action: VoCommercialAction) {
  return [
    action.component.type,
    action.component.name,
    action.component.objectType,
    action.component.predefinedType,
    action.component.description,
    action.component.qsLabel,
    action.component.materialSignature,
    action.component.typeSignature,
    action.component.psetSignature,
    action.starRateCandidate?.title,
    action.starRateCandidate?.reason,
    action.starRateCandidate?.recommendedAction,
    ...action.changes.map((change) => `${change.label} ${change.before} ${change.after}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesStarRateBuildUpRule(rule: StarRateBuildUpRule, action: VoCommercialAction) {
  if (rule.sectionCode && rule.sectionCode !== action.component.smm2SectionCode) return false;
  if (rule.ifcTypes && !rule.ifcTypes.includes(action.component.type)) return false;
  if (rule.corpusPatterns) {
    const corpus = buildStarRateCorpus(action);
    if (!rule.corpusPatterns.some((pattern) => pattern.test(corpus))) return false;
  }
  return true;
}

function resolveStarRateBuildUpRule(action: VoCommercialAction) {
  return PROJECT_QS_OVERRIDES.starRateBuildUpRules.find((rule) => matchesStarRateBuildUpRule(rule, action));
}

function formatBuildUpReference(index: number) {
  return `SR-${String(index + 1).padStart(3, '0')}`;
}

function setFormulaCell(sheet: XLSX.WorkSheet, address: string, formula: string, format?: string) {
  sheet[address] = { t: 'n', f: formula };
  if (format) {
    sheet[address].z = format;
  }
}

function buildStarRateBuildUpSheet(rows: VoCommercialAction[]) {
  const starRateRows = rows.filter((row) => row.action === 'Addition' && (row.rateStatus === 'forced-star-rate' || Boolean(row.starRateCandidate)));
  const aoa: any[][] = [
    [`Star Rate Build-up Engine - ${PROJECT_QS_OVERRIDES.projectName}`],
    [],
    ['Purpose', 'Auto-generated rate build-up cards for star-rate additions. Update the seeded input cells with live quotations, labour dayworks, plant costs, and negotiated mark-ups before submission.'],
    ['CTPO Guardrail', `Material wastage is preloaded. Overheads & Profit defaults to ${formatPercentValue(0.15)} unless the project override states otherwise.`],
    [],
  ];
  const blocks: Array<{ materialRow: number; laborRow: number; plantRow: number; subtotalRow: number; opRow: number; totalRow: number; unitRateRow: number }> = [];

  if (starRateRows.length === 0) {
    aoa.push(['No star rate build-up cards were required for this comparison.']);
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet['!cols'] = [{ wch: 24 }, { wch: 110 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 48 }];
    sheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 2, c: 1 }, e: { r: 2, c: 8 } },
      { s: { r: 3, c: 1 }, e: { r: 3, c: 8 } },
      { s: { r: 5, c: 0 }, e: { r: 5, c: 8 } },
    ];
    return sheet;
  }

  starRateRows.forEach((row, index) => {
    const buildUpRef = formatBuildUpReference(index);
    const profile = resolveStarRateBuildUpRule(row) ?? {
      id: 'generic-star-rate',
      label: 'Generic star rate build-up',
      materialLabel: 'Primary material package',
      materialRate: 0,
      materialWastage: 0.05,
      materialNote: 'Replace with current supplier quotation.',
      laborLabel: 'Trade labour gang',
      laborOutputHoursPerUnit: 1,
      laborDayRate: 120,
      laborHoursPerDay: 8,
      laborNote: 'Replace with prevailing daywork / labour quotation.',
      plantLabel: 'Plant / machinery allowance',
      plantRate: 0,
      plantNote: 'Leave blank unless special plant is required.',
      overheadProfitPercent: 0.15,
    };

    if (aoa.length > 5) aoa.push([]);
    aoa.push([`${buildUpRef} - ${formatElementLabel(row.component)}`]);
    aoa.push(['Build-up Ref', buildUpRef, 'Section', `${row.component.smm2SectionCode} - ${row.component.smm2SectionTitle}`, 'Location', row.component.gridRoomName || row.component.levelName || row.component.buildingName || '-']);
    aoa.push(['Global ID', row.component.ifcId, 'Trigger', row.starRateCandidate?.title || row.rateLabel, 'Pricing Status', formatPricingSource(row)]);
    aoa.push(['QS Description', formatElementLabel(row.component), 'Measure Basis', `${row.quantityLabel}${row.measurementNote ? ` ${row.measurementNote}` : ''}`, 'Quantity', `${row.quantity.toFixed(4)} ${row.unit}`]);
    aoa.push(['Recommended Action', row.starRateCandidate?.recommendedAction || 'Review with QS before submission.', 'Rule Profile', profile.label, 'BQ Item Ref', row.bqItemReference || 'Not found in awarded BQ']);
    aoa.push(['Cost Component', 'Description', 'Base Qty', 'Unit', 'Input 1', 'Input 2', 'Input 3', 'Amount', 'Notes']);

    const materialRow = aoa.length + 1;
    aoa.push(['Material Cost', profile.materialLabel, row.quantity, row.unit, profile.materialRate, profile.materialWastage, '', '', `${profile.materialNote || ''} Wastage preloaded.`.trim()]);
    const laborRow = aoa.length + 1;
    aoa.push(['Labor Cost', profile.laborLabel, row.quantity, row.unit, profile.laborOutputHoursPerUnit, profile.laborDayRate, profile.laborHoursPerDay, '', profile.laborNote || 'Update current labour daywork rate and output constant before final issue.']);
    const plantRow = aoa.length + 1;
    aoa.push(['Plant / Machineries', profile.plantLabel, row.quantity, row.unit, profile.plantRate ?? 0, '', '', '', profile.plantNote || 'Leave blank unless special plant, crane, or testing equipment is required.']);
    const subtotalRow = aoa.length + 1;
    aoa.push(['Pre-O&P Subtotal', '', '', '', '', '', '', '', 'Material + Labour + Plant']);
    const opRow = aoa.length + 1;
    aoa.push(['Overheads & Profit', 'Mandatory O&P uplift', '', '', profile.overheadProfitPercent, '', '', '', 'Contract / CTPO default mark-up. Adjust only if contract states otherwise.']);
    const totalRow = aoa.length + 1;
    aoa.push(['Total Star Rate Amount', '', '', '', '', '', '', '', 'Subtotal + O&P']);
    const unitRateRow = aoa.length + 1;
    aoa.push(['Derived Unit Rate', '', row.quantity, row.unit, '', '', '', '', 'Use this supported rate in the Star Rate Register and negotiation.']);
    aoa.push(['Negotiation Shield', '', '', '', '', '', '', '', `Material wastage ${formatPercentValue(profile.materialWastage)} and O&P ${formatPercentValue(profile.overheadProfitPercent)} are already built in. Challenge any cut line-by-line, not by lump-sum discount.`]);

    blocks.push({ materialRow, laborRow, plantRow, subtotalRow, opRow, totalRow, unitRateRow });
  });

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  blocks.forEach((block) => {
    setFormulaCell(sheet, `G${block.materialRow}`, `C${block.materialRow}*(1+F${block.materialRow})`, '0.0000');
    setFormulaCell(sheet, `H${block.materialRow}`, `G${block.materialRow}*E${block.materialRow}`, `${PROJECT_QS_OVERRIDES.currencySymbol} 0.00`);
    setFormulaCell(sheet, `H${block.laborRow}`, `C${block.laborRow}*E${block.laborRow}*(F${block.laborRow}/G${block.laborRow})`, `${PROJECT_QS_OVERRIDES.currencySymbol} 0.00`);
    setFormulaCell(sheet, `H${block.plantRow}`, `C${block.plantRow}*E${block.plantRow}`, `${PROJECT_QS_OVERRIDES.currencySymbol} 0.00`);
    setFormulaCell(sheet, `H${block.subtotalRow}`, `SUM(H${block.materialRow}:H${block.plantRow})`, `${PROJECT_QS_OVERRIDES.currencySymbol} 0.00`);
    setFormulaCell(sheet, `H${block.opRow}`, `H${block.subtotalRow}*E${block.opRow}`, `${PROJECT_QS_OVERRIDES.currencySymbol} 0.00`);
    setFormulaCell(sheet, `H${block.totalRow}`, `H${block.subtotalRow}+H${block.opRow}`, `${PROJECT_QS_OVERRIDES.currencySymbol} 0.00`);
    setFormulaCell(sheet, `H${block.unitRateRow}`, `IF(C${block.unitRateRow}=0,0,H${block.totalRow}/C${block.unitRateRow})`, `${PROJECT_QS_OVERRIDES.currencySymbol} 0.00`);
    if (sheet[`F${block.materialRow}`]) sheet[`F${block.materialRow}`].z = '0%';
    if (sheet[`E${block.opRow}`]) sheet[`E${block.opRow}`].z = '0%';
    if (sheet[`E${block.materialRow}`]) sheet[`E${block.materialRow}`].z = `${PROJECT_QS_OVERRIDES.currencySymbol} 0.00`;
    if (sheet[`F${block.laborRow}`]) sheet[`F${block.laborRow}`].z = `${PROJECT_QS_OVERRIDES.currencySymbol} 0.00`;
    if (sheet[`E${block.plantRow}`]) sheet[`E${block.plantRow}`].z = `${PROJECT_QS_OVERRIDES.currencySymbol} 0.00`;
  });

  sheet['!cols'] = [
    { wch: 22 },
    { wch: 44 },
    { wch: 12 },
    { wch: 10 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 70 },
  ];
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 2, c: 1 }, e: { r: 2, c: 8 } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 8 } },
  ];

  for (let rowIndex = 0; rowIndex < aoa.length; rowIndex += 1) {
    if (typeof aoa[rowIndex]?.[0] === 'string' && /^SR-\d{3}/.test(aoa[rowIndex]![0] as string)) {
      sheet['!merges'].push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: 8 } });
    }
  }

  return sheet;
}

function buildMappingRegisterSheet(rows: VoCommercialAction[], pricingContext?: BqMappingContext) {
  const unique = new Map<string, { label: string; section: string; unit: string; mappedReference: string; mappedItem?: BqLineItem; recommendations: ReturnType<typeof recommendBqMatches> }>();

  rows.forEach((row) => {
    const label = formatElementLabel(row.component);
    if (unique.has(label)) return;
    const mappedReference = pricingContext?.labelMappings[label] ?? '';
    const mappedItem = mappedReference ? pricingContext?.itemsByReference[mappedReference] : undefined;
    const recommendations = pricingContext ? recommendBqMatches(Object.values(pricingContext.itemsByReference), label, row.component.smm2SectionCode, row.unit) : [];
    unique.set(label, {
      label,
      section: row.component.smm2SectionCode,
      unit: row.unit,
      mappedReference,
      mappedItem,
      recommendations,
    });
  });

  const aoa: any[][] = [
    [`BQ Mapping Register - ${PROJECT_QS_OVERRIDES.projectName}`],
    [],
    ['QS Description', 'Section', 'System Unit', 'Suggested BQ Ref', 'Suggested Description', 'Suggested Score', 'Mapped BQ Ref', 'Mapped BQ Description', 'Mapped Unit', 'Contract Rate', 'Status'],
  ];

  if (unique.size === 0) {
    aoa.push(['-', '-', '-', '-', '-', '-', '-', '-', '-', '-', 'No mapping candidates available.']);
  } else {
    [...unique.values()].sort((left, right) => left.section.localeCompare(right.section) || left.label.localeCompare(right.label)).forEach((row) => {
      const suggestion = row.recommendations[0];
      const status = !row.mappedItem
        ? 'Unmapped'
        : row.mappedItem.unit === row.unit
          ? 'Unit OK'
          : `Unit mismatch (${row.mappedItem.unit} vs ${row.unit})`;
      aoa.push([
        row.label,
        row.section,
        row.unit,
        suggestion?.itemReference ?? '-',
        suggestion?.description ?? '-',
        suggestion?.score ?? '-',
        row.mappedReference || '-',
        row.mappedItem?.description ?? '-',
        row.mappedItem?.unit ?? '-',
        typeof row.mappedItem?.contractRate === 'number' ? formatCurrencyValue(row.mappedItem.contractRate) : '-',
        status,
      ]);
    });
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: 48 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 44 },
    { wch: 14 },
    { wch: 16 },
    { wch: 44 },
    { wch: 12 },
    { wch: 18 },
    { wch: 22 },
  ];
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
  ];
  return sheet;
}

function buildSectionSummary(rows: VoCommercialAction[]) {
  const map = new Map<string, {
    code: string;
    title: string;
    items: number;
    omissions: number;
    additions: number;
    pendingRates: number;
    netValue: number;
    starRate: number;
  }>();

  rows.forEach((row) => {
    const key = `${row.component.smm2SectionSort}|${row.component.smm2SectionCode}`;
    const bucket = map.get(key) ?? {
      code: row.component.smm2SectionCode,
      title: row.component.smm2SectionTitle,
      items: 0,
      omissions: 0,
      additions: 0,
      pendingRates: 0,
      netValue: 0,
      starRate: 0,
    };

    bucket.items += 1;
    if (row.action === 'Omission') bucket.omissions += 1;
    if (row.action === 'Addition') bucket.additions += 1;
    if (row.rateStatus === 'pending') bucket.pendingRates += 1;
    if (typeof row.amount === 'number') bucket.netValue += row.amount;
    if (row.starRateCandidate || row.rateStatus === 'forced-star-rate') bucket.starRate += 1;
    map.set(key, bucket);
  });

  return [...map.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([, value]) => value);
}

function buildCoverSheet(rows: VoCommercialAction[], results: VoComparisonResults, context: VoReportContext) {
  const breakdown = buildCommercialBreakdown(results, context.pricingContext);
  const sectionSummary = buildSectionSummary(rows);
  const starRateItems = rows
    .filter((row) => row.action === 'Addition' && (Boolean(row.starRateCandidate) || row.rateStatus === 'forced-star-rate'))
    .map((row) => [
      row.component.smm2SectionCode,
      row.component.levelName || '-',
      row.component.gridRoomName || '-',
      formatElementLabel(row.component),
      row.starRateCandidate?.title || '-',
      formatAmountValue(row),
    ]);

  const aoa: any[][] = [
    [`Variation Order Cover Sheet - ${PROJECT_QS_OVERRIDES.projectName}`],
    ['Project', PROJECT_QS_OVERRIDES.projectName],
    ['Contract Title', PROJECT_QS_OVERRIDES.voCoverSheet.contractTitle],
    ['Contract Number', PROJECT_QS_OVERRIDES.voCoverSheet.contractNumber],
    ['Employer', PROJECT_QS_OVERRIDES.voCoverSheet.employer],
    ['Consultant / S.O.', PROJECT_QS_OVERRIDES.voCoverSheet.consultant],
    ['VO Reference', PROJECT_QS_OVERRIDES.voCoverSheet.voReference],
    ['Revision Reference', PROJECT_QS_OVERRIDES.voCoverSheet.revisionReference],
    ['Base Model', context.baseModelName || 'Base IFC not recorded'],
    ['Revision Model', context.revisionModelName || 'Revision IFC not recorded'],
    ['Prepared By', PROJECT_QS_OVERRIDES.voCoverSheet.preparedBy],
    ['Checked By', PROJECT_QS_OVERRIDES.voCoverSheet.checkedBy],
    ['Report Date', formatTimestamp()],
    ['Submission Purpose', 'IFC-based VO substantiation pack for QS review and submission preparation.'],
    [],
    ['Headline Metrics'],
    ['Metric', 'Value'],
    ['Total Technical Changes', results.added.length + results.deleted.length + results.modified.length],
    ['Raw Modified Items', results.modified.length],
    ['Commercial Omissions', breakdown.summary.omissions],
    ['Commercial Additions', breakdown.summary.additions],
    ['Modified Split Pairs', breakdown.summary.modifiedPairs],
    ['Rated Actions', breakdown.summary.ratedActions],
    ['Pending Rate Actions', breakdown.summary.pendingRateActions],
    ['Contract BQ Rated Actions', breakdown.actions.filter((action) => action.pricingSource === 'contract-bq').length],
    ['High-Risk Quantity Items', breakdown.summary.highRiskQuantityItems],
    ['Addition Value', formatSignedCurrencyValue(breakdown.summary.additionValue)],
    ['Omission Value', formatSignedCurrencyValue(breakdown.summary.omissionValue)],
    ['Net Rated Value', formatSignedCurrencyValue(breakdown.summary.netValue)],
    ['QS Filtered Items', results.qsSummary.ignoredItems],
    ['Protected Value', formatCurrencyValue(results.qsSummary.protectedValue)],
    ['Formwork Alerts', results.qsSummary.formworkAlerts],
    ['Star Rate Candidates', breakdown.actions.filter((action) => action.action === 'Addition' && (Boolean(action.starRateCandidate) || action.rateStatus === 'forced-star-rate')).length],
    ['EOT Flags', results.qsSummary.eotFlags],
    [],
    ['Section Snapshot'],
    ['Section', 'Title', 'Rows', 'Omissions', 'Additions', 'Pending Rates', 'Net Value', 'Star Rate'],
    ...(sectionSummary.length > 0
      ? sectionSummary.map((item) => [item.code, item.title, item.items, item.omissions, item.additions, item.pendingRates, formatSignedCurrencyValue(item.netValue), item.starRate])
      : [['-', 'No sections detected', 0, 0, 0, 0, formatSignedCurrencyValue(0), 0]]),
    [],
    ['Submission Notes'],
    ['1. Commercial output forces all Modified items into Omission and Addition actions.'],
    ['2. Replace provisional project rates with contract rates before submission.'],
    ['3. Review the Star Rate Register sheet for geometry-driven abnormal items.'],
    ['4. Attach the Star Rate Build-up sheet, sketches, and site evidence for highlighted addition rows.'],
    [],
    ['Star Rate Preview'],
    ['Section', 'Level', 'Grid/Room', 'QS Description', 'Candidate', 'Rated Amount'],
    ...(starRateItems.length > 0
      ? starRateItems
      : [['-', '-', '-', 'No star rate candidates triggered in this comparison.', '-', '-']]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: 20 },
    { wch: 42 },
    { wch: 18 },
    { wch: 18 },
    { wch: 36 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
  ];
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
  ];
  return sheet;
}

function buildSummarySheet(results: VoComparisonResults, pricingContext?: BqMappingContext) {
  const breakdown = buildCommercialBreakdown(results, pricingContext);
  const sheet = XLSX.utils.aoa_to_sheet([
    [`VO Substantiation Summary - ${PROJECT_QS_OVERRIDES.projectName}`],
    [],
    ['Metric', 'Value'],
    ['Added', results.added.length],
    ['Deleted', results.deleted.length],
    ['Modified', results.modified.length],
    ['Commercial Omissions', breakdown.summary.omissions],
    ['Commercial Additions', breakdown.summary.additions],
    ['Modified Split Pairs', breakdown.summary.modifiedPairs],
    ['Rated Actions', breakdown.summary.ratedActions],
    ['Pending Rate Actions', breakdown.summary.pendingRateActions],
    ['High-Risk Quantity Items', breakdown.summary.highRiskQuantityItems],
    ['Addition Value', formatSignedCurrencyValue(breakdown.summary.additionValue)],
    ['Omission Value', formatSignedCurrencyValue(breakdown.summary.omissionValue)],
    ['Net Rated Value', formatSignedCurrencyValue(breakdown.summary.netValue)],
    ['QS Counted Items', results.qsSummary.countedItems],
    ['QS Filtered Items', results.qsSummary.ignoredItems],
    ['Protected Value', formatCurrencyValue(results.qsSummary.protectedValue)],
    ['Formwork Alerts', results.qsSummary.formworkAlerts],
    ['Star Rate Candidates', breakdown.actions.filter((action) => action.action === 'Addition' && (Boolean(action.starRateCandidate) || action.rateStatus === 'forced-star-rate')).length],
    ['EOT Flags', results.qsSummary.eotFlags],
  ]);
  sheet['!cols'] = [{ wch: 28 }, { wch: 22 }];
  return sheet;
}

function buildStarRateRegister(rows: VoCommercialAction[]) {
  const starRateRows = rows.filter((row) => row.action === 'Addition' && (Boolean(row.starRateCandidate) || row.rateStatus === 'forced-star-rate'));

  const aoa: any[][] = [
    [`Star Rate Register - ${PROJECT_QS_OVERRIDES.projectName}`],
    [],
    [
      'Section',
      'Level',
      'Block',
      'Zone',
      'Grid/Room',
      'QS Description',
      'Measure',
      'Measure Rule',
      'Qty Source',
      'Qty Risk',
      'Qty',
      'Unit',
      'BQ Item Ref',
      'BQ Description',
      'Pricing Source',
      'Rate',
      'Amount',
      'VO Action',
      'Formwork Alert',
      'Star Rate Candidate',
      'EOT Trigger',
      'Recommended Action',
      'Change Details',
      'Build-up Ref',
    ],
  ];

  if (starRateRows.length === 0) {
    aoa.push(['-', '-', '-', '-', '-', 'No star rate candidates triggered in this comparison.', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
  } else {
    starRateRows.forEach((row) => {
      const buildUpRef = formatBuildUpReference(starRateRows.indexOf(row));
      aoa.push([
        row.component.smm2SectionCode,
        row.component.levelName || '-',
        row.component.blockName || '-',
        row.component.zoneName || '-',
        row.component.gridRoomName || '-',
        formatElementLabel(row.component),
        `${row.quantityLabel}${row.measurementNote ? ` ${row.measurementNote}` : ''}`,
        formatMeasurementRule(row),
        formatQuantitySource(row),
        formatQuantityRisk(row),
        row.quantity.toFixed(4),
        row.unit,
        row.bqItemReference ?? '-',
        row.bqDescription ?? '-',
        formatPricingSource(row),
        formatRateValue(row),
        formatAmountValue(row),
        row.action,
        formatFormworkAlert(row),
        row.starRateCandidate?.title || '-',
        formatEotFlag(row),
        row.starRateCandidate?.recommendedAction || '-',
        formatCommercialDetail(row),
        buildUpRef,
      ]);
    });
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: 10 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 36 },
    { wch: 24 },
    { wch: 30 },
    { wch: 14 },
    { wch: 42 },
    { wch: 12 },
    { wch: 10 },
    { wch: 16 },
    { wch: 38 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 44 },
    { wch: 34 },
    { wch: 40 },
    { wch: 40 },
    { wch: 80 },
    { wch: 14 },
  ];
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 23 } },
  ];
  return sheet;
}

function buildDetailSheet(rows: VoCommercialAction[]) {
  const aoa: any[][] = [
    [`JKR / SMM2 VO Substantiation Sheet - ${PROJECT_QS_OVERRIDES.projectName}`],
    [],
    [
      'Section',
      'Section Title',
      'Level',
      'Block',
      'Zone',
      'Grid/Room',
      'Location Type',
      'Host / Opening Link',
      'Shield',
      'Protected Qty',
      'Protected Value',
      'Formwork Alert',
      'Star Rate Candidate',
      'EOT Trigger',
      'QS Description',
      'Measure',
      'Measure Rule',
      'Qty Source',
      'Qty Risk',
      'Qty',
      'Unit',
      'BQ Item Ref',
      'BQ Description',
      'Pricing Source',
      'Rate',
      'Amount',
      'Rate Status',
      'VO Action',
      'Tech Status',
      'QS Impact',
      'IFC Type',
      'Global ID',
      'Change Details',
      'Build-up Ref',
    ],
  ];

  let currentGroup = '';
  rows.forEach((row) => {
    const component = row.component;
    const groupKey = `${component.smm2SectionCode}|${component.levelName}|${component.blockName}|${component.zoneName}|${component.gridRoomName}`;
    if (groupKey !== currentGroup) {
      currentGroup = groupKey;
      aoa.push([]);
      aoa.push([
        `Section ${component.smm2SectionCode}`,
        component.smm2SectionTitle,
        component.levelName || '-',
        component.blockName || '-',
        component.zoneName || '-',
        component.gridRoomName || '-',
      ]);
    }

    aoa.push([
      component.smm2SectionCode,
      component.smm2SectionTitle,
      component.levelName || '-',
      component.blockName || '-',
      component.zoneName || '-',
      component.gridRoomName || '-',
      component.preferredLocationKind || '-',
      formatOpeningLink(component),
      formatShieldSummary(row),
      formatProtectedQuantity(row),
      formatProtectedValue(row),
      formatFormworkAlert(row),
      formatStarRateCandidate(row),
      formatEotFlag(row),
      formatElementLabel(component),
      `${row.quantityLabel}${row.measurementNote ? ` ${row.measurementNote}` : ''}`,
      formatMeasurementRule(row),
      formatQuantitySource(row),
      formatQuantityRisk(row),
      row.quantity.toFixed(4),
      row.unit,
      row.bqItemReference ?? '-',
      row.bqDescription ?? '-',
      formatPricingSource(row),
      formatRateValue(row),
      formatAmountValue(row),
      row.rateStatus === 'forced-star-rate' ? 'Item Not Found in BQ - Forced Star Rate' : row.rateStatus,
      row.action,
      row.sourceStatus,
      row.qsImpact,
      component.type,
      component.ifcId,
      formatCommercialDetail(row),
    ]);
  });

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: 10 },
    { wch: 34 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 22 },
    { wch: 12 },
    { wch: 30 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 38 },
    { wch: 40 },
    { wch: 40 },
    { wch: 48 },
    { wch: 24 },
    { wch: 30 },
    { wch: 14 },
    { wch: 42 },
    { wch: 12 },
    { wch: 10 },
    { wch: 16 },
    { wch: 38 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 22 },
    { wch: 26 },
    { wch: 90 },
  ];
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 32 } },
  ];
  return sheet;
}

export function exportVoSubstantiationWorkbook(results: VoComparisonResults, context: VoReportContext = {}) {
  const workbook = XLSX.utils.book_new();
  const breakdown = buildRows(results, context.pricingContext);

  XLSX.utils.book_append_sheet(workbook, buildCoverSheet(breakdown.actions, results, context), 'VO Cover Sheet');
  XLSX.utils.book_append_sheet(workbook, buildSummarySheet(results, context.pricingContext), 'Summary');
  XLSX.utils.book_append_sheet(workbook, buildStarRateRegister(breakdown.actions), 'Star Rate Register');
  XLSX.utils.book_append_sheet(workbook, buildStarRateBuildUpSheet(breakdown.actions), 'Star Rate Build-up');
  XLSX.utils.book_append_sheet(workbook, buildMappingRegisterSheet(breakdown.actions, context.pricingContext), 'BQ Mapping Register');
  XLSX.utils.book_append_sheet(workbook, buildDetailSheet(breakdown.actions), 'VO Substantiation');

  const fileName = `vo-substantiation-${Date.now()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
