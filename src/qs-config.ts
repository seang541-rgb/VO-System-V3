export interface Smm2SectionDefinition {
  code: string;
  title: string;
  order: number;
}

export interface Smm2SectionRule {
  code: string;
  ifcTypes?: string[];
  typePattern?: RegExp;
  corpusPatterns?: RegExp[];
}

export interface QsPhraseRule {
  pattern: RegExp;
  phrase: string;
}

export interface ShieldRateRule {
  id: string;
  label: string;
  unit: string;
  rate: number;
  sectionCode?: string;
  ruleIds?: string[];
  ifcTypes?: string[];
}

export interface CommercialRateRule {
  id: string;
  label: string;
  unit: string;
  rate: number;
  sectionCode?: string;
  ifcTypes?: string[];
  quantityKeys?: string[];
  quantityPatterns?: RegExp[];
  corpusPatterns?: RegExp[];
}

export interface EotTriggerRule {
  id: string;
  title: string;
  reason: string;
  recommendedAction: string;
  ifcTypes?: string[];
  changedFields?: string[];
  corpusPatterns?: RegExp[];
}

export interface StarRateBuildUpRule {
  id: string;
  label: string;
  sectionCode?: string;
  ifcTypes?: string[];
  corpusPatterns?: RegExp[];
  materialLabel: string;
  materialRate: number;
  materialWastage: number;
  materialNote?: string;
  laborLabel: string;
  laborOutputHoursPerUnit: number;
  laborDayRate: number;
  laborHoursPerDay: number;
  laborNote?: string;
  plantLabel: string;
  plantRate?: number;
  plantNote?: string;
  overheadProfitPercent: number;
}

export type QuantityNormalizationTrigger = 'default' | 'formwork-alert';

export type QuantityNormalizationStrategy =
  | 'concrete-net-volume'
  | 'concrete-fallback-volume'
  | 'formwork-derived-area'
  | 'brickwork-net-area'
  | 'brickwork-volume-over-thickness'
  | 'finishes-net-area'
  | 'finishes-volume-over-thickness'
  | 'item-count'
  | 'generic-area'
  | 'generic-volume';

export interface QuantityNormalizationRule {
  id: string;
  label: string;
  sectionCode: string;
  unit: string;
  trigger?: QuantityNormalizationTrigger;
  ifcTypes?: string[];
  strategies: QuantityNormalizationStrategy[];
}

export interface FormworkTriggerConfig {
  enabled: boolean;
  applicableIfcTypes: string[];
  maxVolumeDelta: number;
  minSurfaceIncrease: number;
  minSurfaceIncreaseRatio: number;
  minPerimeterIncrease: number;
  minMeshIncrease: number;
}

export interface VoCoverSheetConfig {
  contractTitle: string;
  contractNumber: string;
  employer: string;
  consultant: string;
  voReference: string;
  revisionReference: string;
  preparedBy: string;
  checkedBy: string;
}

export type PreferredLocationKind =
  | 'axis'
  | 'room'
  | 'zone'
  | 'block'
  | 'level'
  | 'path'
  | 'unassigned';

export interface LocationSelectorConfig {
  structural: PreferredLocationKind;
  mep: PreferredLocationKind;
  opening: PreferredLocationKind;
  finish: PreferredLocationKind;
  default: PreferredLocationKind;
}

export interface ProjectQsOverrides {
  projectName: string;
  currencySymbol: string;
  sectionRules: Smm2SectionRule[];
  materialRules: QsPhraseRule[];
  commercialRateRules: CommercialRateRule[];
  quantityNormalizationRules: QuantityNormalizationRule[];
  shieldRateRules: ShieldRateRule[];
  eotTriggerRules: EotTriggerRule[];
  starRateBuildUpRules: StarRateBuildUpRule[];
  formworkTrigger: FormworkTriggerConfig;
  voCoverSheet: VoCoverSheetConfig;
  typeFallbacks: Record<string, string>;
  nounOverrides: Record<string, string>;
  locationAliases: Record<string, string>;
  axisAliases: Record<string, string>;
  roomAliases: Record<string, string>;
  zoneAliases: Record<string, string>;
  blockAliases: Record<string, string>;
  locationSelectors: LocationSelectorConfig;
}

export const STRUCTURAL_TYPES = [
  'IfcBeam',
  'IfcColumn',
  'IfcFooting',
  'IfcMember',
  'IfcSlab',
  'IfcWall',
  'IfcWallStandardCase',
];

export const WALL_TYPES = ['IfcWall', 'IfcWallStandardCase'];
export const OPENING_TYPES = ['IfcDoor', 'IfcWindow'];
export const FINISH_TYPES = [
  'IfcCovering',
  'IfcCurtainWall',
  'IfcPlate',
  'IfcRailing',
  'IfcRoof',
];
export const MEP_TYPES = [
  'IfcPipeSegment',
  'IfcDuctSegment',
  'IfcSanitaryTerminal',
  'IfcFlowSegment',
  'IfcFlowTerminal',
  'IfcFlowController',
  'IfcFlowFitting',
  'IfcFlowMovingDevice',
  'IfcFlowStorageDevice',
  'IfcFlowTreatmentDevice',
  'IfcDistributionElement',
  'IfcCableCarrierSegment',
  'IfcEquipmentElement',
  'IfcEnergyConversionDevice',
];

export const SMM2_SECTIONS: Record<string, Smm2SectionDefinition> = {
  F: { code: 'F', title: 'Concrete Work', order: 6 },
  G: { code: 'G', title: 'Brickwork and Blockwork', order: 7 },
  M: { code: 'M', title: 'Finishes, Tiling and Surface Treatments', order: 13 },
  Q: { code: 'Q', title: 'Doors, Windows and Ironmongery', order: 17 },
  U: {
    code: 'U',
    title: 'Plumbing and Mechanical Engineering Installations',
    order: 21,
  },
  ZZ: { code: 'ZZ', title: 'Unmapped - manual QS review required', order: 99 },
};

export const SMM2_SECTION_RULES: Smm2SectionRule[] = [
  {
    code: 'F',
    ifcTypes: ['IfcBeam', 'IfcColumn', 'IfcFooting', 'IfcSlab', 'IfcMember'],
    corpusPatterns: [/concrete/i, /\brc\b/i, /\bc\d{2,3}\b/i, /precast/i],
  },
  {
    code: 'F',
    ifcTypes: ['IfcBeam', 'IfcColumn', 'IfcFooting', 'IfcSlab', 'IfcMember'],
  },
  {
    code: 'F',
    ifcTypes: WALL_TYPES,
    corpusPatterns: [/concrete/i, /\brc\b/i, /\bc\d{2,3}\b/i, /precast/i],
  },
  {
    code: 'G',
    ifcTypes: WALL_TYPES,
    corpusPatterns: [/brick/i, /block/i, /masonry/i, /aac/i],
  },
  {
    code: 'M',
    ifcTypes: FINISH_TYPES,
  },
  {
    code: 'M',
    corpusPatterns: [
      /tile/i,
      /plaster/i,
      /render/i,
      /paint/i,
      /finish/i,
      /ceiling/i,
      /screed/i,
      /cladding/i,
      /lining/i,
      /waterproof/i,
    ],
  },
  {
    code: 'Q',
    ifcTypes: OPENING_TYPES,
  },
  {
    code: 'Q',
    corpusPatterns: [
      /door/i,
      /window/i,
      /ironmongery/i,
      /hardware/i,
      /frame/i,
      /glazing/i,
    ],
  },
  {
    code: 'U',
    ifcTypes: MEP_TYPES,
  },
  {
    code: 'U',
    typePattern: /(Pipe|Duct|Flow|Sanitary|Equipment|Cable|Distribution|Pump|Fan|Valve)/i,
  },
  {
    code: 'U',
    corpusPatterns: [
      /plumbing/i,
      /sanitary/i,
      /duct/i,
      /pipe/i,
      /valve/i,
      /pump/i,
      /fan/i,
      /sprinkler/i,
      /lighting/i,
    ],
  },
];

export const QS_DIMENSION_ATTRIBUTE_PATTERNS = [/thickness/i, /width/i, /depth/i];
export const QS_DIMENSION_QUANTITY_PATTERNS = [/thickness/i, /width/i, /depth/i];
export const QS_HEIGHT_ATTRIBUTE_PATTERNS = [/height/i];
export const QS_HEIGHT_QUANTITY_PATTERNS = [/height/i];
export const QS_WIDTH_ATTRIBUTE_PATTERNS = [/width/i];
export const QS_WIDTH_QUANTITY_PATTERNS = [/width/i];
export const QS_DIAMETER_ATTRIBUTE_PATTERNS = [
  /diameter/i,
  /nominal.?diameter/i,
  /pipe.?size/i,
];
export const QS_DIAMETER_QUANTITY_PATTERNS = [/diameter/i, /nominal.?diameter/i];
export const QS_PROFILE_PATTERNS = [/profile/i, /section/i, /size/i];
export const QS_INSTALLATION_PATTERNS = [/mortar/i, /fixing/i, /installation/i, /finish/i];
export const QS_MATERIAL_ATTRIBUTE_PATTERNS = [
  /material/i,
  /grade/i,
  /mortar/i,
  /finish/i,
  /lining/i,
];
export const GRID_LIKE_PATTERNS = [
  /(grid|axis|bay|[a-z]+\s*[-/]\s*\d+|[a-z]\d+|\d+[a-z])/i,
];

export const QS_MATERIAL_RULES: QsPhraseRule[] = [
  { pattern: /common brick/i, phrase: 'common brickwork' },
  { pattern: /face brick|facing brick/i, phrase: 'facing brickwork' },
  { pattern: /clay brick/i, phrase: 'clay brickwork' },
  { pattern: /concrete block/i, phrase: 'concrete blockwork' },
  { pattern: /aac block/i, phrase: 'aac blockwork' },
  { pattern: /block/i, phrase: 'blockwork' },
  { pattern: /brick/i, phrase: 'brickwork' },
  { pattern: /reinforced concrete|\brc\b/i, phrase: 'reinforced concrete' },
  { pattern: /precast concrete/i, phrase: 'precast concrete' },
  { pattern: /\bc\d{2,3}\b/i, phrase: 'reinforced concrete' },
  { pattern: /concrete/i, phrase: 'concrete work' },
  { pattern: /porcelain tile/i, phrase: 'porcelain tile finish' },
  { pattern: /ceramic tile/i, phrase: 'ceramic tile finish' },
  { pattern: /stone cladding/i, phrase: 'stone cladding' },
  { pattern: /gypsum|plasterboard/i, phrase: 'plasterboard lining' },
  { pattern: /paint/i, phrase: 'paint finish' },
  { pattern: /screed/i, phrase: 'cement sand screed' },
  { pattern: /wash.?hand.?basin/i, phrase: 'wash hand basin' },
  { pattern: /water closet|wc pan/i, phrase: 'water closet set' },
  { pattern: /urinal/i, phrase: 'urinal set' },
  { pattern: /pipe/i, phrase: 'pipework' },
  { pattern: /duct/i, phrase: 'ductwork' },
  { pattern: /cable tray/i, phrase: 'cable tray' },
];

export const QS_TYPE_FALLBACKS: Record<string, string> = {
  IfcBeam: 'beam',
  IfcColumn: 'column',
  IfcCovering: 'finishes layer',
  IfcCurtainWall: 'curtain wall',
  IfcDoor: 'door set',
  IfcDuctSegment: 'ductwork',
  IfcEquipmentElement: 'equipment',
  IfcFlowTerminal: 'terminal',
  IfcFooting: 'footing',
  IfcMember: 'member',
  IfcOpeningElement: 'opening',
  IfcPipeSegment: 'pipework',
  IfcRoof: 'roof covering',
  IfcSanitaryTerminal: 'sanitary fitting',
  IfcSlab: 'slab',
  IfcWall: 'wall',
  IfcWallStandardCase: 'wall',
  IfcWindow: 'window set',
};
