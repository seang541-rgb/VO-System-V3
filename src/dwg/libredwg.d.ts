/**
 * Type declarations for @mlightcad/libredwg-web WASM output.
 * The library has no built-in .d.ts — these are derived from runtime inspection.
 */

export interface DwgPoint2D {
  x: number;
  y: number;
}

export interface DwgPoint3D extends DwgPoint2D {
  z: number;
}

export interface DwgEntity {
  type: string;
  layer: string;
  colorIndex?: number;

  // LINE
  startPoint?: DwgPoint3D;
  endPoint?: DwgPoint3D;

  // CIRCLE / ARC
  center?: DwgPoint3D;
  radius?: number;
  startAngle?: number;
  endAngle?: number;

  // ELLIPSE
  majorAxisEndPoint?: DwgPoint3D;
  axisRatio?: number;

  // LWPOLYLINE / POLYLINE_2D
  vertices?: DwgPoint2D[];
  closed?: boolean;

  // TEXT / MTEXT
  text?: string;
  contents?: string;
  textValue?: string;
  string?: string;
  insertionPoint?: DwgPoint3D;
  position?: DwgPoint3D;
  height?: number;
  textHeight?: number;
}

export interface DwgLayerEntry {
  name: string;
  colorIndex?: number;
}

export interface DwgDatabase {
  entities: DwgEntity[];
  tables?: {
    LAYER?: {
      entries: DwgLayerEntry[];
    };
  };
}
