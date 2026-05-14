// Day 1 smoke test — verify classify_element / inferStructuralRole / normalizeRevitName / computePlasterArea
// Run with: npx tsx src/audit/smm2-rules.smoke.ts
import {
  classifyElement,
  inferStructuralRole,
  normalizeRevitName,
  computePlasterArea,
  type ElementInput,
} from './smm2-rules';
import type { MeshMetrics } from './types';

const tests: { input: ElementInput; expect: string }[] = [
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

let pass = 0;
let fail = 0;
for (const t of tests) {
  const role = inferStructuralRole(t.input);
  const result = classifyElement(t.input, role);
  if (result.jkrCode === t.expect) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${t.input.ifcClass} "${t.input.name}" → ${result.jkrCode} (expected ${t.expect})`);
  }
}

// Alias inference
const aliasBeam = inferStructuralRole({ ifcClass: 'IfcBuildingElementProxy', name: '', textSignature: 'Steel Beam W12x26', isExternal: null, loadBearing: null });
console.log(`alias → beam: ${aliasBeam} ${aliasBeam === 'beam' ? '✓' : '✗ FAIL'}`);

const aliasMullion = inferStructuralRole({ ifcClass: 'IfcMember', name: '', textSignature: 'Curtain Wall Mullion', isExternal: null, loadBearing: null });
console.log(`mullion blocked: ${aliasMullion} ${aliasMullion === null ? '✓' : '✗ FAIL'}`);

// Revit name normalization
const norm = normalizeRevitName('Wall: Generic - 200mm: 1234567');
console.log(`normalize trailing digits: "${norm}" ${norm === 'Wall: Generic - 200mm' ? '✓' : '✗ FAIL'}`);

// Plaster area math
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
const plaster = computePlasterArea(wallMetrics, 5, 8);
console.log(`plaster area (50 - 8 - 5 = 37): ${plaster} ${plaster === 37 ? '✓' : '✗ FAIL'}`);

const plasterNull = computePlasterArea({ ...wallMetrics, wallSideAreaM2: null }, 5, 8);
console.log(`plaster null when no wallSideArea: ${plasterNull} ${plasterNull === null ? '✓' : '✗ FAIL'}`);

console.log(`\n${pass}/${pass + fail} classification tests passed`);
process.exit(fail > 0 ? 1 : 0);
