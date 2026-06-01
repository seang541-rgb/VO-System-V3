// Unified quantity model — both IFC and DWG ingestion produce QuantityItem[].
// DWG items carry no 2D/3D geometry; just the billable numbers + confidence.

export type QuantitySource = 'ifc' | 'dwg';
export type MeasureKind = 'count' | 'length' | 'area' | 'volume';
export type Confidence = 'high' | 'review';

export interface QuantityItem {
  source: QuantitySource;
  category: string;        // 柱 / 门 / 雨水管 ...
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
