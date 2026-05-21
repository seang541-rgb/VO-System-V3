import { describe, it, expect } from 'vitest';
import {
  classifyElement,
  inferStructuralRole,
  normalizeRevitName,
  computePlasterArea,
  type ElementInput,
} from './smm2-rules';
import type { MeshMetrics } from './types';

describe('classifyElement', () => {
  const cases: { input: ElementInput; expect: string }[] = [
    { input: { ifcClass: 'IfcWall', name: 'Wall: 200mm: 12345', textSignature: '', isExternal: true, loadBearing: true }, expect: 'JKR-WALL-EXT-LB' },
    { input: { ifcClass: 'IfcWall', name: 'Wall: 100mm', textSignature: '', isExternal: true, loadBearing: false }, expect: 'JKR-WALL-EXT' },
    { input: { ifcClass: 'IfcWall', name: 'Wall', textSignature: '', isExternal: false, loadBearing: true }, expect: 'JKR-WALL-INT-LB' },
    { input: { ifcClass: 'IfcWall', name: 'Wall', textSignature: '', isExternal: false, loadBearing: false }, expect: 'JKR-WALL-INT' },
    { input: { ifcClass: 'IfcWall', name: 'Wall', textSignature: '', isExternal: null, loadBearing: null }, expect: 'JKR-WALL-UNK' },
    { input: { ifcClass: 'IfcSlab', name: 'Stair Slab Landing', textSignature: '', isExternal: null, loadBearing: null }, expect: 'JKR-SLAB-STAIR' },
    { input: { ifcClass: 'IfcSlab', name: 'Floor Slab', textSignature: '', isExternal: null, loadBearing: null }, expect: 'JKR-SLAB' },
    { input: { ifcClass: 'IfcCovering', name: 'Ceiling Plaster', textSignature: '', isExternal: null, loadBearing: null }, expect: 'JKR-CEILING' },
    { input: { ifcClass: 'IfcCovering', name: 'Floor Tile', textSignature: '', isExternal: null, loadBearing: null }, expect: 'JKR-FLOOR-FINISH' },
    { input: { ifcClass: 'IfcBeam', name: 'Beam 300x600', textSignature: '', isExternal: null, loadBearing: null }, expect: 'JKR-BEAM' },
    { input: { ifcClass: 'IfcColumn', name: 'C1', textSignature: '', isExternal: null, loadBearing: null }, expect: 'JKR-COLUMN' },
    { input: { ifcClass: 'IfcDoor', name: 'Door 1', textSignature: '', isExternal: null, loadBearing: null }, expect: 'JKR-IFCDOOR' },
  ];

  cases.forEach(({ input, expect: expected }) => {
    it(`${input.ifcClass} "${input.name}" → ${expected}`, () => {
      const role = inferStructuralRole(input);
      const result = classifyElement(input, role);
      expect(result.jkrCode).toBe(expected);
    });
  });
});

describe('inferStructuralRole', () => {
  it('alias → beam from textSignature', () => {
    const role = inferStructuralRole({ ifcClass: 'IfcBuildingElementProxy', name: '', textSignature: 'Steel Beam W12x26', isExternal: null, loadBearing: null });
    expect(role).toBe('beam');
  });

  it('mullion blocked', () => {
    const role = inferStructuralRole({ ifcClass: 'IfcMember', name: '', textSignature: 'Curtain Wall Mullion', isExternal: null, loadBearing: null });
    expect(role).toBeNull();
  });
});

describe('normalizeRevitName', () => {
  it('strips trailing colon + digits', () => {
    expect(normalizeRevitName('Wall: Generic - 200mm: 1234567')).toBe('Wall: Generic - 200mm');
  });
});

describe('computePlasterArea', () => {
  const wallMetrics: MeshMetrics = {
    bbox: null,
    grossVolumeM3: null,
    surfaceAreaM2: null,
    wallSideAreaM2: 50,
    openingAreaM2: null,
    vertices: null,
    faces: null,
    source: 'mesh',
  };

  it('subtracts door + window area from wallSideArea', () => {
    expect(computePlasterArea(wallMetrics, 5, 8)).toBe(37);
  });

  it('returns null when wallSideAreaM2 is null', () => {
    expect(computePlasterArea({ ...wallMetrics, wallSideAreaM2: null }, 5, 8)).toBeNull();
  });
});
