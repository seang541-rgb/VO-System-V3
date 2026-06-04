export type ChangeCategory = 'core' | 'reference' | 'attribute' | 'quantity' | 'geometry';
export type QsImpact = 'counted' | 'ignored';

export interface BimAttributeValue {
  key: string;
  label: string;
  value: string;
  source: 'pset' | 'type-pset' | 'derived';
}

export interface BimQuantityValue {
  key: string;
  label: string;
  value: number;
  unit: string;
  source: 'qto' | 'type-qto' | 'geometry' | 'bbox' | 'derived';
}

export interface BimComponent {
  ifcId: string;
  expressID: number;
  type: string;
  name: string;
  objectType: string;
  predefinedType: string;
  description: string;
  tag: string;
  placementId: number | null;
  representationId: number | null;
  typeSignature: string;
  materialSignature: string;
  psetSignature: string;
  geometrySignature: string;
  locationPath: string;
  siteName: string;
  buildingName: string;
  levelName: string;
  blockName: string;
  zoneName: string;
  roomName: string;
  axisName: string;
  gridRoomName: string;
  preferredLocationLabel: string;
  preferredLocationKind: string;
  isOpening: boolean;
  openingHostIfcId: string;
  openingHostType: string;
  openingHostName: string;
  openingCount: number;
  openingSignature: string;
  smm2SectionCode: string;
  smm2SectionTitle: string;
  smm2SectionSort: string;
  trade: string;
  qsLabel: string;
  attributes: Record<string, BimAttributeValue>;
  quantities: Record<string, BimQuantityValue>;
  fingerprint: string;
}

export interface BimFieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
  category: ChangeCategory;
  key?: string;
  delta?: number;
  unit?: string;
  source?: string;
  qsImpact: QsImpact;
  qsReason?: string;
  qsRuleId?: string;
  protectedQuantity?: number;
  protectedUnit?: string;
  protectedRate?: number;
  protectedValue?: number;
  protectedCurrency?: string;
  protectedRateLabel?: string;
}

export interface FormworkAlert {
  message: string;
  reason: string;
  severity: 'warning';
}

export interface StarRateCandidate {
  title: string;
  reason: string;
  recommendedAction: string;
  priority: 'high';
}

export interface EotFlag {
  title: string;
  reason: string;
  recommendedAction: string;
  severity: 'warning';
  ruleId: string;
}

export interface QuantityRiskAlert {
  message: string;
  reason: string;
  recommendedAction: string;
  severity: 'high';
  source: 'bbox';
}

export interface ModifiedBimComponent {
  base: BimComponent;
  rev: BimComponent;
  changes: BimFieldChange[];
  qsImpact: QsImpact;
  formworkAlert?: FormworkAlert;
  starRateCandidate?: StarRateCandidate;
  eotFlag?: EotFlag;
}

export type VoCommercialActionType = 'Omission' | 'Addition';
export type CommercialRateStatus = 'rated' | 'pending' | 'forced-star-rate';
export type CommercialPricingSource = 'contract-bq' | 'project-rate' | 'unmapped' | 'unit-mismatch' | 'forced-star-rate';

export interface CommercialMeasurement {
  key: string;
  label: string;
  quantity: number;
  unit: string;
  source: BimQuantityValue['source'];
  note?: string;
  risk?: QuantityRiskAlert;
}

export interface BqLineItem {
  itemReference: string;
  description: string;
  unit: string;
  contractRate: number;
}

export interface BqMappingContext {
  itemsByReference: Record<string, BqLineItem>;
  labelMappings: Record<string, string>;
}

export interface VoCommercialAction {
  id: string;
  action: VoCommercialActionType;
  sourceStatus: 'Added' | 'Deleted' | 'Modified';
  component: BimComponent;
  counterpart?: BimComponent;
  qsImpact: QsImpact;
  changes: BimFieldChange[];
  protectedValue: number;
  quantityKey: string;
  quantityLabel: string;
  quantity: number;
  unit: string;
  quantitySource: BimQuantityValue['source'];
  measurementNote?: string;
  measurementRuleId?: string;
  measurementRuleLabel?: string;
  quantityRisk?: QuantityRiskAlert;
  rateStatus: CommercialRateStatus;
  pricingSource: CommercialPricingSource;
  bqItemReference?: string;
  bqDescription?: string;
  rate?: number;
  amount?: number;
  rateRuleId?: string;
  rateLabel: string;
  formworkAlert?: FormworkAlert;
  starRateCandidate?: StarRateCandidate;
  eotFlag?: EotFlag;
}

export interface VoCommercialSummary {
  omissions: number;
  additions: number;
  modifiedPairs: number;
  ratedActions: number;
  pendingRateActions: number;
  highRiskQuantityItems: number;
  omissionValue: number;
  additionValue: number;
  netValue: number;
}

export interface VoCommercialBreakdown {
  actions: VoCommercialAction[];
  summary: VoCommercialSummary;
}

export interface VoQsSummary {
  countedItems: number;
  ignoredItems: number;
  countedChanges: number;
  ignoredChanges: number;
  protectedValue: number;
  formworkAlerts: number;
  starRateCandidates: number;
  eotFlags: number;
}

export interface VoComparisonResults {
  added: BimComponent[];
  deleted: BimComponent[];
  modified: ModifiedBimComponent[];
  qsSummary: VoQsSummary;
}
