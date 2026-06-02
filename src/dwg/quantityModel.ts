// Unified quantity model — both IFC and DWG ingestion produce QuantityItem[].
// DWG items carry no 2D/3D geometry; just the billable numbers + confidence.

export type QuantitySource = 'ifc' | 'dwg';
export type MeasureKind = 'count' | 'length' | 'area' | 'volume';
export type Confidence = 'high' | 'review';

/** Translation key for the element kind (resolved in UI via i18n). */
export type ElementKind =
  | 'col300' | 'col450' | 'door' | 'sanitary' | 'rwdp'
  | 'footprint' | 'slab' | 'wall';

export interface QuantityItem {
  source: QuantitySource;
  category: string;        // human label (also used in Excel export / Copilot)
  kind: ElementKind;       // i18n key for the UI
  size?: string;           // e.g. '750mm' (appended after the translated kind)
  measureKind: MeasureKind;
  quantity: number;
  unit: string;            // nr / m / m² / m³
  description?: string;    // for BQ matching
  confidence: Confidence;
  needsReview: boolean;
}

export interface DwgTakeoffResult {
  fileName: string;
  sizeMB: number;
  entities: number;
  items: QuantityItem[];
  /** SVG markup of the annotated column plan (rendered natively by the browser). */
  annotatedSvg: string;
}
