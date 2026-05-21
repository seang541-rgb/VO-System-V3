// Idea Nest Audit — SMM2 / JKR classification rules
// Source: D:/IdeaNest/IdeaNest_Portable/storey.py (despite the filename, this is
// where classify_element + Smm2Config live in the portable build) and
// rules_my_smm2.py (PREFERRED_MEASURE_PATHS data tables).
//
// Pure data + pure functions: no IFC API access here. The caller (Day 2's
// pset-reader.ts) extracts properties from web-ifc and passes them in.

import type { MeshMetrics } from './types';

// ── Config ───────────────────────────────────────────────────────────────────

export interface Smm2Config {
  /** Openings with area below this (m²) are not deducted from the wall. */
  openingIgnoreThresholdM2: number;
}

// ── Preferred-measure lookup tables ──────────────────────────────────────────
// Each entry lists ordered (psetType, psetName, propertyName) tuples.
// The pset-reader walks the candidates from a parsed IFC element and picks
// the FIRST tuple that returned a numeric value — falling back to "any
// matching keyword" if none of the explicit paths hit.

export type MeasureKind = 'volume' | 'area';

export interface PsetPath {
  /** "IfcPropertySet" or "IfcElementQuantity" */
  psetType: 'IfcPropertySet' | 'IfcElementQuantity';
  /** The pset's `Name` attribute, e.g. "Qto_WallBaseQuantities" */
  psetName: string;
  /** The individual property's `Name`, e.g. "NetVolume" */
  propertyName: string;
}

export const PREFERRED_MEASURE_PATHS: Record<string, Record<MeasureKind, PsetPath[]>> = {
  IfcWall: {
    volume: [
      { psetType: 'IfcPropertySet', psetName: 'PSet_Revit_Dimensions', propertyName: 'Volume' },
      { psetType: 'IfcElementQuantity', psetName: 'Qto_WallBaseQuantities', propertyName: 'NetVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'NetVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'Qto_WallBaseQuantities', propertyName: 'GrossVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'GrossVolume' },
    ],
    area: [
      { psetType: 'IfcPropertySet', psetName: 'PSet_Revit_Dimensions', propertyName: 'Area' },
      { psetType: 'IfcElementQuantity', psetName: 'Qto_WallBaseQuantities', propertyName: 'NetSideArea' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' },
      { psetType: 'IfcElementQuantity', psetName: 'Qto_WallBaseQuantities', propertyName: 'GrossSideArea' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'GrossSideArea' },
    ],
  },
  IfcSlab: {
    volume: [
      { psetType: 'IfcElementQuantity', psetName: 'Qto_SlabBaseQuantities', propertyName: 'NetVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'NetVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'Qto_SlabBaseQuantities', propertyName: 'GrossVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'GrossVolume' },
      { psetType: 'IfcPropertySet', psetName: 'PSet_Revit_Dimensions', propertyName: 'Volume' },
    ],
    area: [
      { psetType: 'IfcElementQuantity', psetName: 'Qto_SlabBaseQuantities', propertyName: 'NetArea' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'NetArea' },
      { psetType: 'IfcElementQuantity', psetName: 'Qto_SlabBaseQuantities', propertyName: 'GrossArea' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'GrossArea' },
      { psetType: 'IfcPropertySet', psetName: 'PSet_Revit_Dimensions', propertyName: 'Area' },
    ],
  },
  IfcBeam: {
    volume: [
      { psetType: 'IfcElementQuantity', psetName: 'Qto_BeamBaseQuantities', propertyName: 'NetVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'NetVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'Qto_BeamBaseQuantities', propertyName: 'GrossVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'GrossVolume' },
      { psetType: 'IfcPropertySet', psetName: 'PSet_Revit_Dimensions', propertyName: 'Volume' },
    ],
    area: [
      { psetType: 'IfcPropertySet', psetName: 'PSet_Revit_Dimensions', propertyName: 'Area' },
    ],
  },
  IfcColumn: {
    volume: [
      { psetType: 'IfcElementQuantity', psetName: 'Qto_ColumnBaseQuantities', propertyName: 'NetVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'NetVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'Qto_ColumnBaseQuantities', propertyName: 'GrossVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'GrossVolume' },
      { psetType: 'IfcPropertySet', psetName: 'PSet_Revit_Dimensions', propertyName: 'Volume' },
    ],
    area: [
      { psetType: 'IfcPropertySet', psetName: 'PSet_Revit_Dimensions', propertyName: 'Area' },
    ],
  },
  IfcCovering: {
    volume: [
      { psetType: 'IfcPropertySet', psetName: 'PSet_Revit_Dimensions', propertyName: 'Volume' },
      { psetType: 'IfcElementQuantity', psetName: 'Qto_CoveringBaseQuantities', propertyName: 'NetVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'NetVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'Qto_CoveringBaseQuantities', propertyName: 'GrossVolume' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'GrossVolume' },
    ],
    area: [
      { psetType: 'IfcPropertySet', psetName: 'PSet_Revit_Dimensions', propertyName: 'Area' },
      { psetType: 'IfcElementQuantity', psetName: 'Qto_CoveringBaseQuantities', propertyName: 'NetArea' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'NetArea' },
      { psetType: 'IfcElementQuantity', psetName: 'Qto_CoveringBaseQuantities', propertyName: 'GrossArea' },
      { psetType: 'IfcElementQuantity', psetName: 'BaseQuantities', propertyName: 'GrossArea' },
    ],
  },
};

export const MEASURE_KEYWORDS: Record<MeasureKind, readonly string[]> = {
  volume: ['volume'],
  area: ['area'],
};

// ── Structural-role inference tables ─────────────────────────────────────────

/** Element types that may be structural members in disguise. */
export const STRUCTURAL_ALIAS_TYPES: readonly string[] = [
  'IfcMember',
  'IfcBuildingElementProxy',
];

/** Keywords that promote an alias element to a structural role. */
export const STRUCTURAL_ROLE_KEYWORDS: Record<string, readonly string[]> = {
  beam: ['beam', 'girder', 'joist', 'lintel', 'purlin', 'rafter', 'truss'],
  column: ['column', 'post', 'pile', 'pier', 'stanchion'],
};

/** Keywords that DEMOTE an alias — these are not structural even if matched. */
export const STRUCTURAL_ALIAS_BLOCKLIST: readonly string[] = [
  'mullion',
  'panel',
  'glazed',
  'glazing',
  'window',
  'door',
  'stud',
  'track',
  'rail',
  'handrail',
  'baluster',
  'balustrade',
  'fascia',
];

// ── Element data the rules engine needs ──────────────────────────────────────

/**
 * Pre-extracted view of an IFC element. The IFC reader (Day 2) populates this
 * struct from web-ifc; the rules engine then operates on it without touching
 * any IFC API. This split keeps the rules pure and unit-testable.
 */
export interface ElementInput {
  /** e.g. "IfcWall", "IfcSlab" */
  ifcClass: string;
  /** Element's Name attribute, may be empty */
  name: string;
  /** Element's ObjectType / Description / Tag / PredefinedType joined with " | " */
  textSignature: string;
  /** Already resolved from IsExternal pset */
  isExternal: boolean | null;
  /** Already resolved from LoadBearing pset */
  loadBearing: boolean | null;
}

// ── Classification ───────────────────────────────────────────────────────────

export interface Classification {
  isExternal: boolean | null;
  /** Refined classification, e.g. "external-load-bearing-wall" */
  classification: string;
  jkrCode: string;
  /** Coarse group: "wall" | "slab" | "beam" | "column" | "covering" | other */
  elementGroup: string;
  description: string;
}

/**
 * Mirror of `classify_element()` from the Python audit engine.
 * Pre-condition: caller has already run `inferStructuralRole()` if applicable
 * and passes the result via `structuralRole`.
 */
export function classifyElement(
  el: ElementInput,
  structuralRole: 'beam' | 'column' | null = null,
): Classification {
  const name = el.name.trim();
  // web-ifc returns class names in ALL CAPS (e.g. "IFCWALLSTANDARDCASE").
  // We normalize here once so all subsequent matching is case-insensitive.
  const cls = el.ifcClass.toLowerCase();

  if (structuralRole === 'beam') {
    return {
      isExternal: null,
      classification: 'beam',
      jkrCode: 'JKR-BEAM',
      elementGroup: 'beam',
      description: normalizeRevitName(name) || 'Beam',
    };
  }
  if (structuralRole === 'column') {
    return {
      isExternal: null,
      classification: 'column',
      jkrCode: 'JKR-COLUMN',
      elementGroup: 'column',
      description: normalizeRevitName(name) || 'Column',
    };
  }

  // Use prefix matching so subtypes (IfcWallStandardCase, IfcWallElementedCase,
  // IfcSlabElementedCase, etc.) also resolve to the right branch.
  if (cls.startsWith('ifcwall')) {
    const description = normalizeRevitName(name) || 'Wall';
    if (el.isExternal === true && el.loadBearing === true) {
      return {
        isExternal: el.isExternal,
        classification: 'external-load-bearing-wall',
        jkrCode: 'JKR-WALL-EXT-LB',
        elementGroup: 'wall',
        description,
      };
    }
    if (el.isExternal === true) {
      return {
        isExternal: el.isExternal,
        classification: 'external-wall',
        jkrCode: 'JKR-WALL-EXT',
        elementGroup: 'wall',
        description,
      };
    }
    if (el.loadBearing === true) {
      return {
        isExternal: el.isExternal,
        classification: 'internal-load-bearing-wall',
        jkrCode: 'JKR-WALL-INT-LB',
        elementGroup: 'wall',
        description,
      };
    }
    if (el.isExternal === false) {
      return {
        isExternal: el.isExternal,
        classification: 'internal-wall',
        jkrCode: 'JKR-WALL-INT',
        elementGroup: 'wall',
        description,
      };
    }
    return {
      isExternal: el.isExternal,
      classification: 'wall-unclassified',
      jkrCode: 'JKR-WALL-UNK',
      elementGroup: 'wall',
      description,
    };
  }

  if (cls.startsWith('ifcslab')) {
    const description = normalizeRevitName(name) || 'Slab';
    if (name.toLowerCase().includes('stair')) {
      return {
        isExternal: null,
        classification: 'stair-slab',
        jkrCode: 'JKR-SLAB-STAIR',
        elementGroup: 'slab',
        description,
      };
    }
    return {
      isExternal: null,
      classification: 'slab',
      jkrCode: 'JKR-SLAB',
      elementGroup: 'slab',
      description,
    };
  }

  if (cls.startsWith('ifccovering')) {
    const lowerName = name.toLowerCase();
    const description = normalizeRevitName(name) || 'Covering';
    if (lowerName.includes('ceiling')) {
      return {
        isExternal: null,
        classification: 'ceiling-covering',
        jkrCode: 'JKR-CEILING',
        elementGroup: 'covering',
        description,
      };
    }
    if (lowerName.includes('floor')) {
      return {
        isExternal: null,
        classification: 'floor-covering',
        jkrCode: 'JKR-FLOOR-FINISH',
        elementGroup: 'covering',
        description,
      };
    }
    return {
      isExternal: null,
      classification: 'covering',
      jkrCode: 'JKR-COVERING',
      elementGroup: 'covering',
      description,
    };
  }

  if (cls.startsWith('ifcbeam')) {
    return {
      isExternal: null,
      classification: 'beam',
      jkrCode: 'JKR-BEAM',
      elementGroup: 'beam',
      description: normalizeRevitName(name) || 'Beam',
    };
  }

  if (cls.startsWith('ifccolumn')) {
    return {
      isExternal: null,
      classification: 'column',
      jkrCode: 'JKR-COLUMN',
      elementGroup: 'column',
      description: normalizeRevitName(name) || 'Column',
    };
  }

  // Fallback for unhandled IFC classes.
  return {
    isExternal: null,
    classification: el.ifcClass.toLowerCase(),
    jkrCode: `JKR-${el.ifcClass.toUpperCase()}`,
    elementGroup: el.ifcClass.toLowerCase(),
    description: normalizeRevitName(name) || el.ifcClass,
  };
}

/**
 * Mirrors `infer_structural_role()`. Returns the role only if the element is
 * a beam/column outright, OR an alias whose text signature matches a role
 * keyword and is not in the blocklist.
 */
export function inferStructuralRole(el: ElementInput): 'beam' | 'column' | null {
  const cls = el.ifcClass.toLowerCase();
  if (cls.startsWith('ifcbeam')) return 'beam';
  if (cls.startsWith('ifccolumn')) return 'column';
  // Alias types matched case-insensitively
  if (!STRUCTURAL_ALIAS_TYPES.some((t) => t.toLowerCase() === cls)) return null;

  const text = el.textSignature.trim();
  if (!text) return null;
  const normalized = text.toLowerCase();

  if (STRUCTURAL_ALIAS_BLOCKLIST.some((blocked) => normalized.includes(blocked))) {
    return null;
  }

  for (const [role, keywords] of Object.entries(STRUCTURAL_ROLE_KEYWORDS)) {
    if (keywords.some((kw) => normalized.includes(kw))) {
      return role as 'beam' | 'column';
    }
  }
  return null;
}

// ── Pure-math helpers (no IFC dependency) ───────────────────────────────────

/**
 * Mirror of `compute_plaster_area()`. Input is the wall's mesh metrics plus
 * already-computed deduction areas. Returns null if wall side area is missing.
 */
export function computePlasterArea(
  wallMetrics: MeshMetrics,
  structuralIntersectionAreaM2: number,
  deductedOpeningAreaM2: number,
): number | null {
  if (wallMetrics.wallSideAreaM2 == null) return null;
  return Math.max(
    0,
    wallMetrics.wallSideAreaM2 - deductedOpeningAreaM2 - structuralIntersectionAreaM2,
  );
}

/**
 * Strip Revit's trailing numeric tokens from a name (the engine has been doing
 * this since 2025). e.g. "Wall: Generic - 200mm: 1234567" → "Wall: Generic - 200mm".
 */
export function normalizeRevitName(name: string): string {
  const parts = name.split(':').map((p) => p.trim()).filter(Boolean);
  while (parts.length > 0 && /^\d+$/.test(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.length > 0 ? parts.join(': ') : name;
}
