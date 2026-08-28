# ADR 0002: Adopt a ratcheted vanilla-JavaScript quality profile

- Date: 2026-08-27
- Status: Accepted
- Deciders: Vinny Carpenter

## Context

Scratchpad is intentionally a no-build static application. The v18 standards
describe greenfield limits of 400 lines per file, 40 lines per function, three
nesting levels, strict annotated signatures, and 80% coverage. The existing
application predates those limits: `public/js/app.js` is monolithic, 103
functions across first-party code and tests exceed 40 lines, 13 exceed the
nesting limit, and a repeatable browser workflow measures 35.67% line coverage.
Making the strict gates mandatory immediately would either stop all work or
encourage broad suppressions and noisy rewrites.

## Decision

Keep the production architecture as static HTML, CSS, and vanilla JavaScript
with no build step or runtime packages. Enforce v18 incrementally:

- Biome lints all first-party source and formats every supported file changed
  by a commit or pull request except the two named legacy monoliths in
  `config/format-baseline.json`. Those files retain the established style until
  modularization makes a one-time format migration reviewable.
- TypeScript runs in strict `checkJs` mode for new quality-tooling modules and
  for existing modules as they opt in. Extracted modules must opt in; the
  monolith is not bulk-annotated.
- `config/structure-baseline.json` records only legacy ceilings. New files get
  the 400/40/3 limits immediately; aggregate long/deep function counts and
  known oversize files may only stay level or decrease.
- Chromium's native V8 coverage measures a deterministic core workflow. Its
  initial 35.6% floor is a non-regression gate; 80% remains the target. Every
  approved acceptance criterion still requires a behavior test regardless of
  the aggregate percentage.
- Commitlint, hooks, exact development dependency pins, Bun's frozen lockfile,
  dependency audit, and pull-request CI enforce the remainder of the contract.

The ratchet configuration is the mechanical source of truth. Tighten it in the
same commit whenever a refactor lowers a ceiling.

## Consequences

Quality can improve without changing the deployable runtime or producing a
repository-wide formatting diff. The project cannot honestly claim full v18
greenfield compliance yet, and `app.js` remains the principal structural debt.
CI takes longer because it exercises both a coverage workflow and all three
browsers.

## Alternatives

- A TypeScript/build migration was rejected because it changes the product's
  deployment architecture and is outside this work.
- Immediate hard thresholds were rejected because they would fail unchanged
  legacy code and invite blanket suppressions.
- Unenforced prose-only standards were rejected because they cannot prevent
  regression.
