# VO System MVP

A lightweight IFC-based VO comparison MVP that can:

- load two IFC files in the browser
- detect `Added`, `Deleted`, and `Modified` elements by `GlobalId`
- detect changes in element fields, `type`, `material`, and `pset` references
- apply a first-pass QS rule layer
- generate a JKR / SMM2 style Excel workbook with `VO Cover Sheet`, `Summary`, `Star Rate Register`, and `VO Substantiation` sheets
- group output by `Section`, `Level`, `Block`, `Zone`, and `Grid/Room`
- surface `Host / Opening Link` and `Shield` columns in both UI and Excel output
- read uploaded PDF or scanned-image evidence in VO Copilot, with PDF text extraction and OCR fallback
- run the same comparison from the command line for smoke tests

## Run The UI

Prerequisites: Node.js

1. Install dependencies:
   `npm install`
2. Start the app:
   `npm run dev`
3. Open [http://localhost:3000](http://localhost:3000)
4. Upload a base IFC and a revision IFC
5. Click `Run VO Comparison`
6. Click `Generate VO Excel`
7. Review `VO Cover Sheet` first, then `Star Rate Register` and `VO Substantiation`

The local IFC workspace and Excel export run without cloud configuration. To
enable sign-in, persisted projects, credits, webhooks, API keys, and Copilot,
copy `.env.example` to `.env.local` and set your Supabase publishable key.
After cloud configuration, `/local` remains available for local-only IFC work.

In a cloud project, `VO Copilot` accepts an IFC model or an attached PDF /
scanned image. Searchable PDF pages are extracted directly; scanned pages are
processed with OCR. Document-based answers are grounded on extracted content.

The `VO Cover Sheet` now carries formal header fields such as `Contract`, `Employer`, `Consultant / S.O.`, `VO Reference`, `Revision Reference`, `Prepared By`, and the uploaded `Base / Revision` IFC filenames.

## Run From CLI

Use the built-in comparison script:

`npm run compare -- <base.ifc> <revision.ifc>`

Example with the current sample files in this folder:

`npm run compare -- basin-tessellation.ifc V2_basin.ifc`

Optional JSON output:

`npm run compare -- basin-tessellation.ifc V2_basin.ifc --out compare-result.json`

If both `basin-tessellation.ifc` and `V2_basin.ifc` exist in the project root, you can also simply run:

`npm run compare`

## QS Rule Files

The system now separates shared QS logic from project overrides:

- Base SMM2 and QS dictionaries:
  `src/qs-config.ts`
- Project-specific overrides:
  `src/qs-project-config.ts`
- Runtime helper and label builder:
  `src/qs-helpers.ts`

Edit `src/qs-project-config.ts` when a specific project needs:

- different SMM2 section mapping priority
- custom QS wording
- project-specific element nouns
- explicit quantity-normalization rule tables by SMM2 section and trigger state
- shortened level or room aliases for Excel output
- `axis / room / zone / block` aliases and preferred location strategy

Project overrides are applied before base rules, so contract-specific wording can win without changing the shared engine.


## Shield Rules

The current Shield layer applies first-pass JKR / SMM2 non-deduction protection for opening-related deductions:

- Brickwork opening deductions at or below `0.1 m2` are marked `QS Ignored`
- Concrete void deductions at or below `0.05 m3` are marked `QS Ignored`
- Report rows now show both `Host / Opening Link` and `Shield` so QS review can trace why a deduction was blocked

These rules are intended as an MVP protection layer and can be extended with more contract-specific clauses later.

## Current MVP Scope

This project is intentionally a practical MVP, not a full enterprise VO platform.

It currently focuses on:

- element identity changes
- metadata changes
- type/material/property-set reference changes
- first-pass QS-readable labels
- grouped substantiation output for review
- opening and void non-deduction shielding for small brickwork and concrete deductions
- explicit opening-to-host traceability in the report output
- formwork ripple-effect alerting when geometry complexity rises without meaningful volume change
- automatic star-rate candidate tagging for geometry-driven formwork reassessment
- lightweight EOT trigger flagging for type / material / long-lead specification changes
- forces every `Modified` item into commercial `Omission` + `Addition` rows for BQ / VO output
- applies first-pass SMM2 quantity normalization so concrete stays in `m3`, brickwork / finishes stay in `m2`, and formwork rows can be derived from concrete surface area

It does not yet include:

- full JKR / SMM2 chapter coverage
- detailed rate build-up or cost engine integration
- deep boolean geometry deduction logic
- multi-user workflow or approvals
