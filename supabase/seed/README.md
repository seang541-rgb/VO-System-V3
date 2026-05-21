# Idea Nest — Knowledge Base Seed

8 reference tables backing the Copilot's regulatory / contract / pricing reasoning. Apply files in **strict numeric order**.

## Tables

| # | File | Rows | Purpose |
|---|---|---|---|
| 01 | `01_create_tables.sql` | — | Schema + RLS + indexes |
| 02 | `02_seed_contract_clauses.sql` | 11 | JKR 203 Clause 31/32, PAM 2006 Clause 11, PAM 2018 Clause 11.1 |
| 03 | `03_seed_ubbl_provisions.sql` | 25 | UBBL 1984 Parts V/VI/VII/VIII/XII/XIII key by-laws |
| 04 | `04_seed_ms_standards.sql` | 19 | Malaysian Standards (cement, steel, masonry, concrete, fire, MEP) |
| 05 | `05_seed_vo_templates.sql` | 3 | VO request letter / cost breakdown / approval form |
| 06 | `06_seed_measurement_codes.sql` | 33 | SMM2 sections A-X (22) + NRM elements 1-9 (9) |
| 07 | `07_seed_bim_regulations.sql` | 8 | BIM Strategic Plan, CITP, 11MP, JKR mandates, IBS, Act 520 |
| 08 | `08_seed_competitor_pricing.sql` | 12 | CostX, Cubicost, Cubit, Bluebeam, Procore, Buildxact |
| 09 | `09_seed_qs_companies.sql` | 15 | Klang Valley QS firms (mostly placeholders — REPLACE) |

**Total:** ~126 rows of seed data + schema.

## How to apply

### Local Supabase (recommended for first run)

```powershell
cd "D:/VO system"
for ($f in Get-ChildItem supabase/seed/*.sql | Sort-Object Name) {
  npx supabase db execute --file $f.FullName
}
```

### Direct psql against remote project

```powershell
$env:SUPABASE_DB_URL = "postgres://..."   # service_role connection string
foreach ($f in Get-ChildItem supabase/seed/*.sql | Sort-Object Name) {
  psql $env:SUPABASE_DB_URL -f $f.FullName
}
```

### Single SQL editor paste (Supabase dashboard)

Open SQL editor at https://supabase.com/dashboard → run each file in order. Confirm row count from the trailing `SELECT 'tablename: N rows' AS status` line.

## Data-quality notes

### `verified` column
- `TRUE` = content is high-confidence (well-known regulation, standard contract clause text, official measurement code)
- `FALSE` = needs human verification (most competitor prices, most QS company names, older MS standard revision years)

### Placeholders to replace
- **`qs_companies`** — most entries are placeholder names ("Klang Valley QS Partners X"). Replace with real prospects you research from RISM directory / LinkedIn / project contacts.
- **`competitor_pricing`** — MYR amounts are rough conversions. Re-check vendor sites before quoting in pitches.
- **`ms_standards`** — year on older revisions (MS 76, MS 27, MS 544) marked unverified.

### How the Copilot uses these tables

| Tool | Tables consulted |
|---|---|
| `analyze_contract_clause` | `contract_clauses` (lookup citing clause numbers), `vo_templates` (suggested response template) |
| `audit_ifc` | `ubbl_provisions` (compliance checks), `ms_standards` (specification refs), `measurement_codes` (SMM2/NRM classification) |
| `summarize_commercial_impact` | `measurement_codes` (BQ section grouping) |
| (future) pricing-strategy / sales tools | `competitor_pricing`, `bim_regulations`, `qs_companies` |

## Re-runnability

All seed files use `ON CONFLICT DO NOTHING` on natural keys, so re-running is safe — existing rows aren't touched. To force a refresh of a single row, `DELETE` it first or `UPDATE` directly.

## Schema migration vs seed

These files are **seed data**, not migrations. If you change the schema (e.g. add a column), edit `01_create_tables.sql` AND write a proper migration in `supabase/migrations/` to apply to existing deployments without re-seeding.
