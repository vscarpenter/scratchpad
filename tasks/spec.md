# Standards and simplification implementation

Status: approved 2026-08-27

## Goal

Restore every existing quality gate, make the v18 standards enforceable for
Scratchpad's no-build vanilla-JavaScript architecture, remove retired search
scope code, consolidate repeated accessible-menu behavior, and flatten the
legacy Soft Glass cascade beneath the approved Indigo on Paper shell.

## Inputs and outputs

Inputs:

- `coding-standards.md` v18 and the repository rules in `CLAUDE.md`/`AGENTS.md`
- The existing Playwright, Lambda, shell, vendor, CSP, and app-shell checks
- The approved Indigo on Paper specification and `.ui-craft` brief/tokens
- Current first-party HTML, CSS, JavaScript, scripts, and GitHub workflows

Outputs:

- A green local and CI-equivalent verification baseline
- One canonical coding standard plus a documented vanilla-JS enforcement profile
- Automated format, lint, type, commit, structural, coverage, and CI gates
- No retired search-scope production path
- One shared controller for the four ARIA menus
- A token-driven Indigo on Paper app shell at every breakpoint without legacy glass

## Constraints

- Preserve the static, no-build, same-origin application architecture.
- Preserve IndexedDB data contracts and the sanctioned encrypted share API calls.
- Add no production dependencies, remote assets, telemetry, or third-party runtime requests.
- Never weaken network-isolation, storage-protection, DOM-safety, CSP, or accessibility tests.
- Keep all inline HTML scripts byte-identical; this work must not move CSP hashes.
- Preserve dialog/onboarding/static-page glass; only application-shell glass is retired.
- Keep the chronology rail, folder picker overlay, responsive navigation, and WebKit stacking contract.
- Use token colors only in `public/css/app.css`; no dark-mode selectors there.
- Keep every logical unit green and commit it before moving to the next unit.
- Do not push, deploy, mutate AWS, or bump the release version.

## Edge cases

- The sidebar header must fit at 1440x900 without hiding privacy/status copy or shrinking touch targets.
- Dialog exit motion may leave controls in the accessibility tree briefly; tests must wait for hidden state.
- Search must continue matching titles, bodies, and tags after scope state is removed.
- Menus may have hidden/disabled items, dynamic content, unique positioning, and different focus-return rules.
- Menu keyboard support must cover Arrow Up/Down, Home, End, Escape, Tab, and outside dismissal.
- The folder switcher remains a body-level overlay above the editor in WebKit.
- Mobile list/editor navigation remains one pane below 768px.
- Dark, light, auto, reduced-motion, and reduced-transparency modes remain intentional.
- Legacy structural limits cannot become instant repo-wide hard failures; ratchets may only improve.

## Out of scope

- TypeScript migration or a production build pipeline
- New product features or information-architecture changes
- Dialog, onboarding, content-page, token-palette, or OG-image redesign
- Splitting `app.js` or `app.css` solely to satisfy a line count
- Service-worker scope, sharing infrastructure, CloudFront publishing, release, push, or deployment

## Acceptance criteria

1. Existing browser and vendor failures are resolved; all project gates pass.
2. `coding-standards.md` v18 is canonical and repository guidance no longer conflicts.
3. The project documents and enforces its vanilla-JS profile locally and in CI.
4. New structural violations fail while recorded legacy counts cannot increase.
5. Coverage is measured and cannot regress; any gap to 80% is explicit and ratcheted.
6. Search has no scope state, element lookup, renderer, handler, or compatibility comment.
7. Search tests prove title/body/tag matching and clearing behavior in all browsers.
8. All four menus share one narrow controller while retaining existing semantics and positioning.
9. Menu characterization tests prove focus, keyboard, ARIA, and dismissal behavior.
10. `.sidebar` and `.main` use semantic opaque surfaces without blur or decorative panel elevation at every breakpoint.
11. The document remains the only raised application-shell surface.
12. Light/dark desktop, tablet, and mobile visual verification shows no overflow or unintended redesign.
13. No new unsafe DOM sink, network request, secret, CSP hash, or deployment-surface expansion is introduced.

## Test stubs

- Existing red tests:
  - sidebar header height is at most 330px in all three engines
  - trash dialog can be cancelled and reopened deterministically
- Search:
  - one all-fields query matches title, body, and tags
  - clearing search restores the complete list and removes highlighting
- Menus:
  - shared keyboard navigation skips unavailable items and wraps consistently
  - Escape/outside dismissal restores focus and `aria-expanded`
  - each folder/overflow/list/backup trigger opens only its menu
- CSS:
  - computed app-shell styles use semantic surfaces and no backdrop blur at 375, 768, and desktop widths
  - dialogs retain their intended glass treatment
  - existing token, contrast, touch-target, responsive, scroll, and reduced-motion tests remain green
- Tooling:
  - controlled temporary violations prove each new gate fails closed
  - frozen dependency installation and CI-equivalent verification pass

