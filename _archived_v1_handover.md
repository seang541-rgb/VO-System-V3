# VO System MVP Technical Handover v1

## 1. Overview

This project is a practical IFC-based VO comparison MVP for QS and commercial review.
It is not an enterprise VO platform yet, but it already supports:

- dual IFC comparison
- technical diff detection
- QS-readable labels and location grouping
- SMM2 section mapping
- opening / void shield logic
- formwork ripple-effect alerts
- star-rate candidate tagging
- commercial split of every Modified item into Omission + Addition
- Qty / Unit / Rate / Amount carrying rows
- Excel substantiation workbook export
- CLI smoke-test output

Project path:
`C:\Users\Ng\Desktop\VO system`

## 2. Current Runtime Commands

Defined in [package.json](C:/Users/Ng/Desktop/VO%20system/package.json).

- `npm run dev`
  Starts the browser UI on `http://localhost:3000`
- `npm run lint`
  Runs TypeScript type-checking with `tsc --noEmit`
- `npm run build`
  Builds production bundle with Vite
- `npm run compare`
  Runs CLI IFC comparison script
- `npm run compare -- <base.ifc> <revision.ifc> --out result.json`
  Compares two IFC files and optionally writes JSON output

## 3. High-Level Architecture

The system is split into 6 main layers:

1. IFC extraction and 3D engine
2. QS enrichment and semantic labeling
3. Technical diff core
4. QS rule and shield layer
5. Commercial breakdown layer
6. UI / Excel / CLI output layer

Flow:

1. IFC files are loaded and parsed into `BimComponent[]`
2. Each component is enriched with:
   - SMM2 section
   - QS label
   - location tags
   - opening / host context
   - attributes and quantities
3. `compareModels()` produces raw technical changes
4. QS rules reclassify changes into counted vs ignored
5. Formwork and star-rate triggers are added
6. `buildCommercialBreakdown()` converts results into Omission / Addition commercial actions
7. UI, Excel, and CLI all consume the same commercial breakdown

## 4. Core Data Model

Defined mainly in [vo-diff-core.ts](C:/Users/Ng/Desktop/VO%20system/src/vo-diff-core.ts).

### 4.1 BimComponent

Represents one IFC element after extraction and enrichment.

Key fields:

- identity
  - `ifcId`
  - `expressID`
  - `type`
  - `name`
  - `objectType`
  - `predefinedType`
  - `description`
  - `tag`
- references
  - `typeSignature`
  - `materialSignature`
  - `psetSignature`
- geometry/location
  - `placementId`
  - `representationId`
  - `geometrySignature`
  - `locationPath`
  - `siteName`
  - `buildingName`
  - `levelName`
  - `blockName`
  - `zoneName`
  - `roomName`
  - `axisName`
  - `gridRoomName`
  - `preferredLocationLabel`
  - `preferredLocationKind`
- opening context
  - `isOpening`
  - `openingHostIfcId`
  - `openingHostType`
  - `openingHostName`
  - `openingCount`
  - `openingSignature`
- QS semantics
  - `smm2SectionCode`
  - `smm2SectionTitle`
  - `smm2SectionSort`
  - `trade`
  - `qsLabel`
- extracted values
  - `attributes`
  - `quantities`
  - `fingerprint`

### 4.2 BimFieldChange

Represents one field-level change between base and revision.

Important fields:

- `field`
- `label`
- `before`
- `after`
- `category`
  - `core`
  - `reference`
  - `attribute`
  - `quantity`
  - `geometry`
- `delta`
- `unit`
- `qsImpact`
  - `counted`
  - `ignored`
- `qsReason`
- `qsRuleId`
- `protectedQuantity`
- `protectedRate`
- `protectedValue`

### 4.3 ModifiedBimComponent

Represents a technical modified pair:

- `base`
- `rev`
- `changes`
- `qsImpact`
- `formworkAlert?`
- `starRateCandidate?`

### 4.4 VoCommercialAction

This is the most important commercial output object.

Each technical change is converted into one or more commercial actions.

Fields:

- `id`
- `action`
  - `Omission`
  - `Addition`
- `sourceStatus`
  - `Added`
  - `Deleted`
  - `Modified`
- `component`
- `counterpart?`
- `qsImpact`
- `changes`
- `protectedValue`
- pricing carrier fields
  - `quantityKey`
  - `quantityLabel`
  - `quantity`
  - `unit`
  - `quantitySource`
  - `rateStatus`
  - `rate`
  - `amount`
  - `rateRuleId`
  - `rateLabel`
- `formworkAlert?`
- `starRateCandidate?`

## 5. Main Files and Responsibilities

### 5.1 UI Layer

[App.tsx](C:/Users/Ng/Desktop/VO%20system/src/App.tsx)

Responsibilities:

- upload V1 base and V2 revision IFC files
- show model parse state
- trigger comparison
- trigger Excel export
- display QS / VO result table
- display commercial columns
- display summary cards
- display shield / formwork / star-rate messages

Important anchors:

- `formatRateValue()`
- `formatAmountValue()`
- `formatCommercialDetail()`
- `runVOComparison()`
- `exportWorkbook()`
- `resultRows`

### 5.2 IFC / Engine Layer

[BimEngine.ts](C:/Users/Ng/Desktop/VO%20system/src/BimEngine.ts)

Responsibilities:

- initialize viewer and IFC loader
- load IFC into memory
- extract components
- call comparison core
- highlight comparison in 3D
- re-export commercial breakdown helper

Important anchors:

- `BimEngine`
- `loadIfcModel()`
- `compareModels()`
- `highlightComparison()`
- `export { buildCommercialBreakdown }`

### 5.3 Technical Diff Core

[vo-diff-core.ts](C:/Users/Ng/Desktop/VO%20system/src/vo-diff-core.ts)

Responsibilities:

- define all main runtime data structures
- perform raw diffing
- apply QS rules
- apply shield economics
- generate formwork alerts
- generate star-rate candidates
- build commercial breakdown rows

Important anchors:

- `BimComponent`
- `VoCommercialAction`
- `VoCommercialSummary`
- `applyQsRules()`
- `compareModels()`
- `buildFormworkAlert()`
- `buildStarRateCandidate()`
- `buildCommercialBreakdown()`

### 5.4 Shared QS Configuration

[qs-config.ts](C:/Users/Ng/Desktop/VO%20system/src/qs-config.ts)

Responsibilities:

- define SMM2 section metadata
- define base mapping rules
- define base material phrase rules
- define type fallbacks
- define commercial rate rule schema
- define project override schema

Important anchors:

- `CommercialRateRule`
- `ProjectQsOverrides`
- `SMM2_SECTIONS`
- `SMM2_SECTION_RULES`
- `QS_MATERIAL_RULES`
- `QS_TYPE_FALLBACKS`

### 5.5 Project Override Layer

[qs-project-config.ts](C:/Users/Ng/Desktop/VO%20system/src/qs-project-config.ts)

Responsibilities:

- project name and currency
- project-first wording overrides
- provisional commercial rate rules
- shield rate rules
- formwork trigger thresholds
- cover sheet metadata
- location selector strategy

Important anchors:

- `PROJECT_QS_OVERRIDES`
- `commercialRateRules`
- `shieldRateRules`
- `formworkTrigger`
- `voCoverSheet`
- `locationSelectors`

### 5.6 QS Helper Layer

[qs-helpers.ts](C:/Users/Ng/Desktop/VO%20system/src/qs-helpers.ts)

Responsibilities:

- build QS descriptions by type
- build wall / opening / structural / MEP labels
- resolve SMM2 section info
- resolve preferred location labels
- normalize wording and location aliases

Important anchors:

- `buildWallLabel()`
- `buildOpeningLabel()`
- `buildStructuralLabel()`
- `buildMepLabel()`
- `buildSectionInfo()`

### 5.7 Excel Output Layer

[vo-report.ts](C:/Users/Ng/Desktop/VO%20system/src/vo-report.ts)

Responsibilities:

- build workbook sheets
- build cover sheet
- build summary sheet
- build star-rate register
- build detailed VO substantiation sheet
- export XLSX file

Important anchors:

- `buildCoverSheet()`
- `buildSummarySheet()`
- `buildStarRateRegister()`
- `buildDetailSheet()`
- `exportVoSubstantiationWorkbook()`

### 5.8 CLI Layer

[compare-ifc.ts](C:/Users/Ng/Desktop/VO%20system/scripts/compare-ifc.ts)

Responsibilities:

- parse IFC from command line
- extract components
- run technical + commercial comparison
- print JSON result
- expose summary and commercial actions for smoke testing

Important anchors:

- `extractComponents()`
- `output`
- `commercialActions`

### 5.9 Project Documentation

[README.md](C:/Users/Ng/Desktop/VO%20system/README.md)

Responsibilities:

- explain current scope
- explain runtime commands
- explain config files
- explain shield logic and MVP boundaries

## 6. Delivered Features by Development Sequence

This section reconstructs the actual development sequence from last night to now.

### Stage A. Browser IFC comparison prototype

Delivered:

- dual IFC upload
- model parse state feedback
- run comparison button
- basic viewer and camera controls
- raw Added / Deleted / Modified capability

### Stage B. Real IFC smoke testing

Used real sample files:

- `basin-tessellation.ifc`
- `V2_basin.ifc`

Finding:

- only one real modified item exists
- difference is a `Type reference` change on the sanitary terminal type

Result:

- system was extended to capture reference-level differences instead of only existence differences

### Stage C. Field-level attribute and quantity diff

Delivered:

- per-field diffs instead of only counts
- `before -> after`
- numeric deltas
- quantity change reporting

### Stage D. SMM2 section mapping

Delivered:

- section mapping based on IFC type + material corpus
- sections currently used:
  - `F`
  - `G`
  - `M`
  - `Q`
  - `U`
  - `ZZ`

### Stage E. QS label generation

Delivered:

- machine IFC names translated into QS-facing descriptions
- label assembly logic by category:
  - wall
  - opening
  - structural
  - MEP

### Stage F. Location coordinate system

Delivered:

- level / block / zone / room / axis handling
- preferred location strategy by component category
- grouped output by location dimensions

### Stage G. Opening and void shield

Delivered:

- small brickwork opening deductions ignored
- small concrete void deductions ignored
- protected quantity and protected value support
- host / opening traceability

Implemented thresholds:

- brickwork opening non-deduction:
  - `<= 0.1 m2`
- concrete void non-deduction:
  - `<= 0.05 m3`

### Stage H. Explicit opening-host linkage

Delivered:

- explicit opening semantics in component model
- opening-host identifiers
- opening-host names and types
- opening count and signature tracking

### Stage I. Formwork ripple-effect trigger

Delivered:

- detect small volume change with meaningful geometry/surface complexity rise
- trigger formwork reassessment warning

Trigger logic checks:

- low volume delta
- surface increase
- perimeter/profile increase
- mesh complexity increase

### Stage J. Star-rate candidate tagging

Delivered:

- formwork alert can automatically create a star-rate candidate record
- addition row carries the recommendation text

### Stage K. Excel VO substantiation workbook

Delivered workbook sheets:

- `VO Cover Sheet`
- `Summary`
- `Star Rate Register`
- `VO Substantiation`

### Stage L. Formal cover sheet fields

Delivered fields:

- contract title
- contract number
- employer
- consultant / S.O.
- VO reference
- revision reference
- prepared by
- checked by
- uploaded base / revision IFC file names

### Stage M. Modified forced into Omission + Addition

Delivered:

- technical `Modified` is preserved internally
- commercial output does not use `Modified` as a billing action
- every modified pair becomes:
  - one `Omission`
  - one `Addition`

### Stage N. Qty / Unit / Rate / Amount commercial rows

Delivered:

- pricing carrier fields added to every commercial action
- default project provisional rate rules added
- UI shows pricing fields
- Excel shows pricing fields
- CLI shows pricing fields
- summary includes rated / pending rates and commercial values

## 7. Current Business Logic

### 7.1 Technical Diff Logic

The engine compares base vs revision by `GlobalId`.

Outcomes:

- no base match -> `Added`
- no revision match -> `Deleted`
- same `GlobalId` with field-level changes -> `Modified`

Compared fields include:

- element identity fields
- type / material / pset references
- geometry signature and references
- location fields
- attributes
- quantities
- opening / host context
- QS section / label metadata

### 7.2 QS Rule Logic

Each raw change is passed through `applyQsRules()`.

Current result states:

- `counted`
- `ignored`

Currently implemented MVP rules:

- Brickwork opening deduction ignored when area deduction `<= 0.1 m2`
- Concrete void deduction ignored when volume deduction `<= 0.05 m3`

### 7.3 Shield Economics

If a change is ignored by rule:

- `protectedQuantity` can be derived
- `protectedRate` can be resolved from shield rate config
- `protectedValue` can be calculated

This is the commercial defense layer for non-deduction logic.

### 7.4 Formwork Alert Logic

A formwork reassessment alert can be triggered when:

- element is structural / concrete candidate
- volume change is small
- but surface or profile complexity rises materially

Current trigger config is in [qs-project-config.ts](C:/Users/Ng/Desktop/VO%20system/src/qs-project-config.ts).

### 7.5 Star-Rate Candidate Logic

If a formwork alert is triggered:

- an addition row can be flagged as a star-rate candidate
- recommendation text is attached
- item appears in `Star Rate Register`

### 7.6 Commercial Breakdown Logic

Built by `buildCommercialBreakdown()`.

Rules:

- technical `Modified` -> `Omission + Addition`
- technical `Added` -> `Addition`
- technical `Deleted` -> `Omission`

Each commercial row carries:

- QS description
- location
- quantity basis
- rate and amount if configured
- pending-rate state if not configured
- shield/formwork/star-rate annotations when relevant

## 8. Current Configuration Logic

### 8.1 Shared base config

[qs-config.ts](C:/Users/Ng/Desktop/VO%20system/src/qs-config.ts)

Contains:

- schema types
- SMM2 section definitions
- default section rules
- material phrase rules
- type fallback dictionary

### 8.2 Project override config

[qs-project-config.ts](C:/Users/Ng/Desktop/VO%20system/src/qs-project-config.ts)

Contains:

- project name
- currency symbol
- provisional commercial rate rules
- shield rate rules
- formwork trigger config
- cover-sheet metadata
- location strategy

Current provisional commercial rate examples:

- concrete work provisional rate
- brickwork provisional rate
- finishes provisional rate
- door/window provisional rate
- MEP installation provisional rate

## 9. Current Output Capabilities

### 9.1 Browser UI

The UI now shows:

- file load state
- comparison state
- result summary cards
- grouped result table
- host/opening information
- shield columns
- protected quantity/value
- formwork alerts
- star-rate messages
- measure / qty / unit / rate / amount
- action type and technical status
- detailed change explanation

### 9.2 Excel Workbook

Current sheets:

- `VO Cover Sheet`
- `Summary`
- `Star Rate Register`
- `VO Substantiation`

Current workbook content includes:

- project metadata
- headline metrics
- section snapshot
- star-rate preview
- detailed commercial rows
- pricing carrier columns
- shield / formwork / star-rate commentary

### 9.3 CLI JSON Output

Current summary includes:

- technical counts
- QS counts
- shield totals
- commercial omission/addition counts
- modified split pairs
- rated actions
- pending rate actions
- omission value
- addition value
- net value

Current `commercialActions` entries include:

- action
- sourceStatus
- globalId
- element
- counterpartGlobalId
- quantityKey
- quantityLabel
- quantity
- unit
- quantitySource
- rateStatus
- rate
- amount
- rateRuleId
- rateLabel
- protectedValue
- formworkAlert
- starRateCandidate

## 10. Validation Performed

The following commands were actually run and passed:

- `npm run lint`
- `npm run build`
- `npm run compare`

Most recent real-sample compare result:

- `added = 0`
- `deleted = 0`
- `modified = 1`
- `commercialOmissions = 1`
- `commercialAdditions = 1`
- `modifiedSplitPairs = 1`
- `ratedActions = 2`
- `pendingRateActions = 0`
- `omissionValue = -650`
- `additionValue = 650`
- `netValue = 0`

Commercial output currently generated for the sample sanitary terminal:

- `Omission: 1 nr @ RM 650 = -RM 650`
- `Addition: 1 nr @ RM 650 = RM 650`

## 11. Known Limitations

The current MVP still does not provide:

- full JKR / SMM2 chapter coverage
- contract-grade rate build-up engine
- exact boolean geometry deduction engine
- complete quantity normalization for all IFC authoring styles
- official-form Excel styling with subtotals and signatures
- PDF export package
- database-backed project persistence
- multi-user workflow / review approval
- large-model performance hardening

## 12. Known Risks

### 12.1 Bundle size

`vite build` still shows a large bundle warning.
This is not a functional failure, but it is a future optimization target.

### 12.2 Rate assumptions

Current commercial rate rules are provisional defaults.
They must be replaced by project-specific or contract-specific rates before real commercial submission.

### 12.3 IFC variability

Different authoring tools may store quantities and properties differently.
Current quantity-picking logic is heuristic and may need per-project tuning.

## 13. Recommended Next Upgrade Priorities

Best next steps, in order:

1. formalize quantity normalization
   - unify `NetVolume`, `GrossVolume`, `NetArea`, `Length`, etc.
2. replace provisional rates with project contract rates
   - or support importing rate schedules
3. extend SMM2 mapping coverage
4. extend shield library with more clauses
5. improve Excel format with grouped subtotals
6. add PDF export package
7. add project persistence and saved comparison history
8. optimize viewer/build performance for larger IFCs

## 14. Recommended Reading Order For Another AI Agent

If another AI assistant continues the project, it should read files in this order:

1. [README.md](C:/Users/Ng/Desktop/VO%20system/README.md)
2. [package.json](C:/Users/Ng/Desktop/VO%20system/package.json)
3. [vo-diff-core.ts](C:/Users/Ng/Desktop/VO%20system/src/vo-diff-core.ts)
4. [qs-config.ts](C:/Users/Ng/Desktop/VO%20system/src/qs-config.ts)
5. [qs-project-config.ts](C:/Users/Ng/Desktop/VO%20system/src/qs-project-config.ts)
6. [qs-helpers.ts](C:/Users/Ng/Desktop/VO%20system/src/qs-helpers.ts)
7. [BimEngine.ts](C:/Users/Ng/Desktop/VO%20system/src/BimEngine.ts)
8. [App.tsx](C:/Users/Ng/Desktop/VO%20system/src/App.tsx)
9. [vo-report.ts](C:/Users/Ng/Desktop/VO%20system/src/vo-report.ts)
10. [compare-ifc.ts](C:/Users/Ng/Desktop/VO%20system/scripts/compare-ifc.ts)

## 15. Suggested Immediate Tasks For The Next AI Agent

Concrete handover tasks:

- Task 1
  Replace provisional commercial rates in `qs-project-config.ts` with real project rate rules.
- Task 2
  Improve quantity-selection logic so each SMM2 section uses a stricter primary quantity policy.
- Task 3
  Add Excel grouped subtotals by `Section / Level / Block / Zone / Grid-Room`.
- Task 4
  Add a project import format for rate schedules.
- Task 5
  Extend shield rules beyond the two current opening/void protections.
- Task 6
  Add PDF export for submission packs.

## 16. Current Status Summary

As of `2026-03-12`, the VO System MVP is in a usable QS-facing state.

It is already capable of:

- parsing two IFC files
- detecting technical and semantic changes
- applying first-pass QS protection rules
- generating commercial Omission / Addition rows
- carrying quantities and provisional rates
- exporting a structured VO substantiation workbook

It should be treated as:

- a working MVP for internal QS and VO preparation
- not yet a fully hardened production enterprise platform
