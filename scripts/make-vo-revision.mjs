// One-shot script to create a controlled revision of an IFC file for VO testing.
// Modifies a fixed number of IfcWall + IfcSlab entries:
//   - 3 IfcWall: change Name      → 3 "modified"
//   - 3 IfcSlab: change Name      → 3 "modified"
//   - 2 IfcWall: change GlobalId  → 2 "deleted" + 2 "added" (BimEngine matches by GUID)
//
// Expected VO compare result: { added: 2, deleted: 2, modified: 6 }
//
// Run: node scripts/make-vo-revision.mjs

import fs from 'fs';

const SRC = 'D:/VO system/IFC Schependomlaan incl planningsdata.ifc';
const DST = 'D:/VO system/IFC Schependomlaan REVISION.ifc';

console.log(`Reading: ${SRC}`);
const t0 = Date.now();
const content = fs.readFileSync(SRC, 'utf8');
const lines = content.split('\n');
console.log(`Loaded ${lines.length.toLocaleString()} lines in ${Date.now() - t0} ms`);

// Pass 1: collect line indices for IFCWALL and IFCSLAB entries
const wallLines = [];
const slabLines = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.startsWith('#') && l.includes('= IFCWALL(')) wallLines.push(i);
  else if (l.startsWith('#') && l.includes('= IFCSLAB(')) slabLines.push(i);
}
console.log(`Found ${wallLines.length} IfcWall lines, ${slabLines.length} IfcSlab lines`);

// Plan the changes
const changes = {
  wallsNameMod: wallLines.slice(0, 3),       // 3 "modified" via name change
  wallsGuidMod: wallLines.slice(3, 5),       // 2 "deleted" + 2 "added" via GUID swap
  slabsNameMod: slabLines.slice(0, 3),       // 3 "modified" via name change
};

console.log('Target line indices:');
console.log('  Wall name changes:', changes.wallsNameMod);
console.log('  Wall GUID changes:', changes.wallsGuidMod);
console.log('  Slab name changes:', changes.slabsNameMod);

// Helper: generate a new IFC-style GUID (22 base64-like chars)
function newGuid(seed) {
  // Use seed so result is deterministic across runs (reproducible test)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$';
  let out = '';
  let s = seed;
  for (let i = 0; i < 22; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out += chars[s % chars.length];
  }
  return out;
}

// Snapshot the originals so we can log what was modified
const log = { walls_modified: [], slabs_modified: [], walls_guid_swapped: [] };

const newLines = [...lines];

// 1. Modify Name on 3 IfcWall (3rd argument is Name)
//    IFCWALL('guid', #owner, 'Name', ...) → ...'MODIFIED:Name'...
changes.wallsNameMod.forEach((idx, i) => {
  const orig = newLines[idx];
  // 3rd quoted string is the Name; first two args are 'guid' and #N
  const updated = orig.replace(
    /(IFCWALL\(\s*'[^']*'\s*,\s*#\d+\s*,\s*)('[^']*')/,
    (_match, prefix, nameQuoted) => {
      const name = nameQuoted.slice(1, -1);
      return `${prefix}'MODIFIED-${i + 1}:${name}'`;
    },
  );
  if (updated === orig) {
    console.warn(`  [warn] wall name change at line ${idx} did not match`);
  } else {
    log.walls_modified.push({ lineIdx: idx, before: orig.slice(0, 120), after: updated.slice(0, 120) });
    newLines[idx] = updated;
  }
});

// 2. Modify Name on 3 IfcSlab
changes.slabsNameMod.forEach((idx, i) => {
  const orig = newLines[idx];
  const updated = orig.replace(
    /(IFCSLAB\(\s*'[^']*'\s*,\s*#\d+\s*,\s*)('[^']*')/,
    (_match, prefix, nameQuoted) => {
      const name = nameQuoted.slice(1, -1);
      return `${prefix}'MODIFIED-${i + 1}:${name}'`;
    },
  );
  if (updated === orig) {
    console.warn(`  [warn] slab name change at line ${idx} did not match`);
  } else {
    log.slabs_modified.push({ lineIdx: idx, before: orig.slice(0, 120), after: updated.slice(0, 120) });
    newLines[idx] = updated;
  }
});

// 3. Swap GlobalId on 2 IfcWall (1st argument). This makes the original GUID disappear (= 1 deleted)
//    and a new GUID appear (= 1 added). For 2 walls: 2 deleted + 2 added.
changes.wallsGuidMod.forEach((idx, i) => {
  const orig = newLines[idx];
  const newId = newGuid(idx * 31 + i);
  const updated = orig.replace(
    /(IFCWALL\(\s*)'[^']*'/,
    (_match, prefix) => `${prefix}'${newId}'`,
  );
  if (updated === orig) {
    console.warn(`  [warn] wall GUID change at line ${idx} did not match`);
  } else {
    log.walls_guid_swapped.push({ lineIdx: idx, newGuid: newId, before: orig.slice(0, 80), after: updated.slice(0, 80) });
    newLines[idx] = updated;
  }
});

// Write
const t1 = Date.now();
fs.writeFileSync(DST, newLines.join('\n'));
console.log(`Wrote: ${DST} in ${Date.now() - t1} ms`);

console.log('\n── Changes summary ──────────────────────────────');
console.log(`Walls (name modified):  ${log.walls_modified.length}`);
log.walls_modified.forEach((e) => console.log(`  line ${e.lineIdx}:\n    before: ${e.before}\n    after:  ${e.after}`));
console.log(`\nSlabs (name modified):  ${log.slabs_modified.length}`);
log.slabs_modified.forEach((e) => console.log(`  line ${e.lineIdx}:\n    before: ${e.before}\n    after:  ${e.after}`));
console.log(`\nWalls (GUID swapped → delete+add):  ${log.walls_guid_swapped.length}`);
log.walls_guid_swapped.forEach((e) => console.log(`  line ${e.lineIdx} → newGuid=${e.newGuid}`));

console.log('\n── Expected compare_ifc result ──────────────────');
console.log(`  added:    ${log.walls_guid_swapped.length}`);
console.log(`  deleted:  ${log.walls_guid_swapped.length}`);
console.log(`  modified: ${log.walls_modified.length + log.slabs_modified.length}`);
