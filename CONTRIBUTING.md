# Contributing to Scratchpad

Read `CLAUDE.md` before changing the repository. `coding-standards.md` v18 is
the canonical human reference; the project-specific quality profile is in
`docs/adr/0002-adopt-a-ratcheted-vanilla-javascript-quality-profile.md`.

Scratchpad is a static, privacy-first browser application. Production code may
not add runtime package dependencies, third-party requests, telemetry, remote
fonts, or raw DOM writes. The encrypted share API is the sole network exception.

## Local workflow

```sh
bun install --frozen-lockfile
git config core.hooksPath scripts/hooks
node scripts/dev-server.mjs
npm run verify
npm test
```

Use red/green/refactor for behavior changes. Add characterization coverage
before refactoring shared behavior. Keep commits focused and use
`<type>(<scope>): <description>` with a lowercase imperative subject of at most
72 characters.

### Full-suite release gate

The complete suite saturates a 14-core machine to the point where Playwright
starves attaching the guide popup's new page target (`guide.spec.js` — the
test is deterministic solo and in every subset, and only fails under the full
52-file parallel load). Release verification therefore runs the whole suite
as two halves at default parallelism:

```sh
node scripts/release-gate.mjs
```

Every test still runs across Chromium, Firefox, and WebKit; the halves keep
the sustained machine load under the target-attach threshold. CI (workers: 1,
retries: 2) runs the suite in one serialized process and is authoritative for
pull requests.

`npm run verify` enforces the incremental quality contract. Existing file,
function, nesting, type, and coverage gaps are recorded as ceilings, not
waivers: a change may hold or reduce them, never increase them. New modules
must meet the v18 limits directly.

Do not run a real deploy, mutate AWS, push, or create a pull request without
the authorization described in `CLAUDE.md`.
