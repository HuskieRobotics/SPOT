# 16 — GitHub Issue Backlog as Feature Candidates

Source: the 41 open issues on `HuskieRobotics/SPOT` as of 2026-09-17, read in full including
comments. Each issue is classified for the rewrite as one of:

- **core** — should be a requirement of the rewrite itself (either it is a defect the rewrite
  naturally fixes, or a small feature that is cheaper to build in than to retrofit);
- **next** — a real feature to design for (leave hooks) but deliver after the rewrite ships;
- **covered** — already implied by documents 01–15 (reference given);
- **drop** — superseded by a maintainer answer in document 14 or by the rewrite itself.

Backlog requirement ids are `BL-<issue number>` so they can be traced to GitHub.

## A. Data quality and scouter accuracy (labels: preseason priority)

| Issue | Summary | Class | Requirement |
|-------|---------|-------|-------------|
| #195 | **Scouter accuracy score.** Compare each alliance's scouted totals with TBA/FRC API results; over several matches infer which scouters are likely inaccurate (reference implementation: `cyandev/scouter-opr`). Show a scouter their score and trend on the waiting screen (data lags about two matches). Store per-scouter accuracy in the dataset (a `scouters` map beside `tmps` and `teams`) so it can feed error bars. Requires consistent scouter identity (school username or id instead of free-text names). | next | **BL-195** The dataset model MUST allow a third top-level collection (`scouters`) and the pipeline MUST be able to join TMPs with TBA match results by match and alliance. Sign-in SHOULD capture a stable scouter identifier. |
| #208 | **Auto-flag inaccurate matches** on the Edit page: when an alliance's scouted total deviates significantly from the API result, flag all three TMPs for re-scouting. Maintainer answer 12 confirms the intent of flagging. | next (hook is core) | **BL-208** `flagged` SHOULD become `{ flagged, reason, source: manual\|auto }`; the Edit page and analysis MUST show a visual warning for flagged TMPs (answer 12). |
| #196 | **Error bars** on analysis graphs reflecting data quality (from #195; mean absolute error × 1.25 ≈ one standard deviation). | next | **BL-196** Modules SHOULD accept an optional uncertainty path per series. |
| #37 | Admin "data analysis" tab: view data, data accuracy, blacklist match strings from sync. | next | Fold into #195/#208; blacklist by match string is a small admin feature. |

## B. Scouting client behavior

| Issue | Summary | Class | Requirement |
|-------|---------|-------|-------------|
| #298 | **Timer does not model the pause between auto and teleop** (roughly 3 s while the field timer is halted). Everything after auto is early for scouters syncing to live play or video. Comment notes this was fixed for a past season (#108) and regressed. Answer 16 says 2026 total is 160 s with no extra time, so the pause must be a timer **hold**, not extra game time. | core | **BL-298** `timing` MUST support a configurable hold (timer pause) at a transition, e.g. `"140000": { ..., "pauseMs": 3000 }`; timestamps continue to reflect game time. Covered by T-2 timer tests. |
| #230 | **2× playback button** for re-scouting from video at double speed; must be hard to hit by accident; timestamps stay accurate. | core | **BL-230** Scouting client MUST offer a guarded time-scale control (1×, 2×) that scales the clock; recorded `ts` remain in game time. Tie to the re-scout workflow in answer 29. |
| #93 | **Unsynced matches list**: UI showing scouted matches and which are not yet synced to the server. | core | **BL-93** Client MUST expose the IndexedDB buffer (matches, sync status) with manual retry and QR generation per entry. Strengthens the offline flow from answer 25. |
| #60 | Make the position-lock delay configurable (comment explains the feature: reuse last tapped position for about 1 s). | core | **BL-60** `positionLockMs` MUST be configurable (per config or per `position` executable arg). Answers question 21. |
| #54 | Changing the current match while a waiting scouter is already on the scouting screen does not prompt them with the new assignment. | core | **BL-54** Assignment changes MUST be surfaced to any scouter who has not started, wherever they are. |
| #34 | One scouter starting a match triggers `enterMatch` for all waiting scouters, prompting them with an assignment modal. Answer 28 is undecided on auto-start. | core (decide) | **BL-34** Start rules (document 06, RT-12) MUST be explicit and configurable: admin force-start, auto-start on N waiting, and whether another scouter starting pulls in the rest. |
| #43 / #4 / #44 | Orientation: lock or discourage portrait on match scouting; make landing and analysis portrait-friendly. | core | **BL-43** Match scouting MUST be usable in landscape and SHOULD warn (or lock via config) in portrait; landing/analysis MUST be responsive in both orientations. |
| #8 / #5 | iOS touch responsiveness and CSS issues. | covered | Pointer events and press feedback already required (NF-1, SC-16); T-7 runs mobile viewports. |
| #7 | Add `title`/accessible names to all elements. | core | **BL-7** Accessibility: all controls MUST have accessible names; answer 46 confirms accessibility matters. |
| #35 | "Comment support" — free-text comments from scouters. | next | **BL-35** TMP schema SHOULD reserve a `notes` field and the submit flow a comment step (relates to qualitative scouting #193). |
| #3 | Make `match-control` an executable rather than a special type. | drop | Internal design; the rewrite defines its own button model (document 05). |

## C. Analysis

| Issue | Summary | Class | Requirement |
|-------|---------|-------|-------------|
| #299 | Re-enable Auto Pick List and Simulate Match when relevant (answer 6: disabled deliberately for 2026). | core | **BL-299** Both views MUST be implemented and toggled by configuration, not by commenting out code; pipeline must be able to supply `standardDeviation` and a total score (document 08, AN-23/24). |
| #239 | **Auto-generate an analysis pipeline from TBA** score-breakdown schema with a guided (yes/no) UI, or at least better pipeline debugging tools. Motivated by answer 1 (students without programming experience). | next | **BL-239** Provide a pipeline editor/validator with clear error messages (config validation from T-3 exposed in the UI); TBA-driven generation is a follow-on. |
| #232 / #90 | Run the pipeline client-side only and export CSV in the browser; remove server self-HTTP calls. | covered | Documents 12 (D-5) and 15; answer 11 says CSV columns are not relied upon. |
| #209 | Replace the custom Choose Event dropdown with a standard select. | covered | shadcn Select in document 15. |
| #31 | Strip Mongo `_id` from action-queue subdocuments in the dataset payload. | core | **BL-31** Action objects MUST NOT carry per-action `_id`s (schema `_id: false`), reducing payload size. |

## D. New scouting modalities

| Issue | Summary | Class | Requirement |
|-------|---------|-------|-------------|
| #221 | **Pit scouting**: form-style page for scouters, admin tab listing teams with include/exclude filters on robot features; data joins pick-list building. | next | **BL-221** Data model SHOULD reserve a per-team, per-event `pitScouting` document; Filter Teams SHOULD be able to filter on it. |
| #193 | **Qualitative scouting**: tags selected at match end (Pairwise-style). | next | **BL-193** TMP SHOULD allow an end-of-match tag set defined in config; analysis can count tags. |
| #223 | In-app chatbot (NotebookLM-style, grounded on team-provided docs) on landing, scouting, and submit pages. | next | Out of core scope; keep the hint carousel (SC-12) as the built-in help surface. |

## E. Admin

| Issue | Summary | Class | Requirement |
|-------|---------|-------|-------------|
| #116 | Visual indicator that clicking a scouter disconnects them. | core | **BL-116** Disconnect MUST be an explicit control with an icon, not a hidden click target (document 07, AD-5). |
| #33 | Support or disable multiple admins. Answer 28: 2–3 students share admin duties. | core | **BL-33** Multiple concurrent admin sessions MUST be supported; state changes (current match) propagate to all admin views. |
| #120 | Middleware-based auth and demo-mode checks. | covered | Document 15 (Next.js middleware) and document 12 (S-1). |
| #218 | Single implementation of the demo-mode label. | covered | Shared components in the rewrite. |

## F. Platform, hosting, and telemetry

| Issue | Summary | Class | Requirement |
|-------|---------|-------|-------------|
| #197 | **Hosted SPOT for other teams**: multi-tenant instance with per-team databases and, later, per-team uploaded JSON configs. | next (design hook) | **BL-197** Configuration and data access SHOULD be scoped by a tenant/team key from day one (even if only one tenant exists) so multi-tenancy is an additive change. |
| #91 | Opt-in anonymous usage tracking configured in setup. | next | **BL-91** Setup wizard SHOULD include an opt-in telemetry toggle; off by default. |
| #79 | AWS AMI local MongoDB not starting. | drop | AMI path retired (answer 44); MongoDB Atlas on all clouds (answer 48). |

## G. Code hygiene (superseded by the rewrite)

| Issue | Summary | Class |
|-------|---------|-------|
| #227 comments everywhere, #9 ES modules, #36 rename CSS variables, #6 CSS fallbacks | drop | Addressed by TypeScript, modules, and Tailwind tokens in the rewrite; documentation requirement remains (CONTRIBUTING). |
| #126 Google sign-in | drop | Answer 7: drop. |
| #121 Checklist feature | drop | Answer 10: not used. |

## Suggested inclusion in the rewrite scope

Core for the rewrite: BL-298, BL-230, BL-93, BL-60, BL-54, BL-34, BL-43, BL-7, BL-299,
BL-31, BL-116, BL-33. Design hooks to leave in place: BL-195 (`scouters` dataset), BL-208
(flag metadata), BL-35/BL-193 (notes and tags on TMP), BL-221 (pit scouting document),
BL-197 (tenant scoping), BL-91 (telemetry toggle). Everything else is post-rewrite.
