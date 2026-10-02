# Manual updates to shared links

Date: 2026-10-02
Status: implemented and locally verified; deployment pending

The sender may replace the published title, text, and tags at an existing URL
by clicking **Update shared link** after saving locally. Ordinary editing,
saving, startup, and opening Share produce no API traffic. Other links and
recipient copies remain independent. Attachments are excluded.

The URL, encryption key, and server-owned expiry remain fixed. PUT requires
the private local owner token, fresh encryption uses a fresh IV, and conditional
storage writes prevent stale overwrites and resurrection after revocation.
Retries reuse a persisted encrypted operation. Conflicts require explicitly
reviewing the current published copy before republishing.

The recipient remains read-only and sees publication time and reload guidance.
Expiry blocks reads and updates. An hourly cleanup job removes ciphertext by
original expiry; PUT remains disabled until cleanup is provisioned on an
unversioned shares bucket. No server history, account, sync, or polling is added.

The complete behavior, rollout, and acceptance contract is in
[the implementation plan](../plans/2026-10-02-update-shared-links.md).
Design approval covers implementation and local verification continuously.
AWS mutations and public deployment still require explicit authorization.
