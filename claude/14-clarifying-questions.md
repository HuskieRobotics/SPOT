# 14 — Clarifying Questions

Answers to these questions will sharpen the specification in documents 01–13. They are grouped
by the decision they unblock. Each question notes what the analysis currently **assumes** so
you can simply confirm or correct.

## A. Scope and goals of the rewrite

1. **Scope of "rewrite":** Is the goal a like-for-like rebuild (same features, same JSON config
   formats, same MongoDB schema) or a redesign that may change the configuration format and
   database schema? _Assumed: like-for-like behavior with freedom to change internals._

   Same features. Other changes fine if they provide benefit and are necessary. JSON config, or something similar, is important since students who configure the scouting interface and analysis pipeline for SPOT may not have any programming experience; JSON is accessible. This is especially true of other teams who may not have any students familiar with web applications.

2. **Compatibility with existing data:** Must the rewrite read the existing `teamMatchPerformances`
   and `events` collections unchanged, or is a one-time migration acceptable? _Assumed: read
   existing data unchanged._

   A migration is acceptable. We actually had to do that last year to support a new feature. Furthermore, if the benefit is worth it, leaving behind the old data is fine. We rarely look back at previous seasons.

3. **Compatibility with archived configs:** Should the 2022–2025 `config/*-YYYY.json` files still
   load in the rewrite, or is only the 2026 configuration a required fixture? _Assumed: 2026 is
   required; older ones are nice-to-have._

   Similar to the answer to #2, none are a required fixture. That said the general structure of the JSON files are document; especially the one for the analysis pipeline; so, leveraging that documentation and knowledge of best practices and required elements is useful to preserve if possible.

4. **Technology constraints:** Any required or forbidden stacks (must stay Node/Express/MongoDB?
   TypeScript? a frontend framework? a build step allowed?). The current app has no bundler and
   ships vanilla JS. _Assumed: free choice._

   Free choice, but I would prefer that it mirrors the technologies I teach in my software engineering class (Next.js, Tailwind, MongoDB).

5. **Extension model:** Do you still want drop-in files for custom transformers, modules, and
   executables (principle P4), or is a registration API / plugin package acceptable?

   An extension model is a critical feature that differentiates SPOT from other FRC scouting apps. It doesn't have to be a drop-in files approach. However, as mentioned in the answer to #1, it is a requirement that students without programming experience can customize SPOT through this extension model.

## B. Features actually in use (to decide keep / drop / restore)

6. **Simulate Match and Auto Pick List** are commented out in the analysis UI. Were they
   disabled deliberately for 2026, or just unfinished? Should the rewrite restore them?

   Disabled deliberately for 2026. I expect they will be re-enabled in the future. 2026 was an odd season in that it wasn't feasible to count every fuel that was scored. As a result, much of the scouting is more qualitative in nature. If future seasons are more typical these features will be re-enabled.

7. **Google sign-in** is non-functional. Drop it, or implement real Google auth?

   Drop it.

8. **Manual schedule (`/schedule`)**: is it used at events (e.g. off-season events without
   TBA)? Does it need persistence across restarts and lock/unlock per row as the Usage Guide
   describes?

   Manual schedule is used at events without TBA, which are very few at this point. This feature is a low priority and certainly could be dropped. It does need to function as documented in the usage guide.

9. **FRC Events (FMS) API** practice-match fallback: still used? Should it also be an explicit
   choice rather than a fallback only when TBA fails?

   Not used.

10. **Checklist page** (`src/checklist`, unmounted): abandoned, or a pick-list feature you want?

Not used.

11. **CSV export**: who consumes `teams.csv` (spreadsheet, pick-list tools)? Are the column
    names and the `0` for missing values relied upon?

    If the SPOT visualization is insufficient for a question that we want to answer, we can download this file, dump it into Google Sheets, and do our own anaylsis. Names and specific values are not relied upon.

12. **Flagging** TMPs currently only stores a boolean; analysis ignores it. Should flagged TMPs
    be excluded from analysis, highlighted, or something else?

    It is okay that analysis ignores it. Perhaps analysis should provide an visual warning that this data has been flagged. The flagged feature is to alert the scouting administrators that the data for this match is suspect and the match should be rescouted. A future feature is that matches could be flagged automatically if the data is suspect. For example, if the total points for an alliance based on the scouter data is off from the total points reported via TBA.

13. **Manual data hooks** (`manual/teams.json`, `tmps.json`): ever used? Keep or remove?

    These are primarily used by different parts of the server talking to itself.

14. **Filter Teams** rating bands (Rating1–4 thresholds, OPR ranges 0–100/101–150/151–250/250+)
    are hard-coded for 2026. Should these be configurable?

    Yes.

15. **Server restart from admin** and **restart-on-config-save**: acceptable to keep, or should
    the rewrite hot-reload configuration without exiting?

    Acceptable to keep; always nicer too support hot reload.

## C. Game-specific behavior currently hard-coded (document 12, F-19)

16. **Match timing model:** `totalTime` is 160 s with transitions at 159.999 s ("Auto"),
    140 s ("Teleop Transition"), 130 s ("Teleop"). What do these correspond to in the real
    2026 match (auto length, the 10 s transition, teleop 130 s)? Is the extra time intentional
    so scouters can start the clock early?

    Matches in 2026 were 160s. 20s for auto and 140s for teleop. The first 10 seconds of teleop was "transition", followed by 4, 25 second periods, and then a 30s end game. There was no extra time. Previous seasons had 150s matches (I believe).

17. **Shifts:** the client toggles active/inactive every 25 s of match time after the scouter
    presses `teleopActive`/`teleopInactive`, and labels endgame at ≤ 30 s. Are these actual 2026
    game rules, and should the rewrite make the shift model configurable (interval, phase
    boundaries, prefix names)?

    These are actual 2026 game rules as described in my answer to #16. I think the current code does make this cnofigurable through the match-scouting.json file.

18. **A-Stop lock:** the lock applies while `time > 140000`. Is the intent "until the end of
    auto" and should that boundary come from the transition config rather than a constant?

    The intent is until the end of auto.

19. **Alliance zone buttons:** confirm the intended semantics: physical button positions map to
    the red/blue ends of the field, and the recorded id (`AZone` vs `OAZone`) is relative to
    the scouted robot's alliance. Should `SWAP_ZONE_BUTTON_LOCATIONS` also flip the heatmap?

    The team sits on one side of the field or the other at a given competition. It could even change from one day to the next. As a result, the blue alliance is sometimes on the left and sometimes on the right. The intent of this feature is for the scouting admin to specify the field orientation such that what the scouters see in SPOT matches what they see when looking at the field.

20. **Heatmap half-field transform** (`x > 69.5` and `x < 30.5` folded onto a half field,
    middle third discarded): is this the desired 2026 behavior, and should it be a module
    option?

    Desired 2026 behavior that should be a module option.

21. **Position lock** (1 s reuse of the last tapped position): keep the 1 s value? Configurable?

    Not sure what this feature does or how it is intended to be used.

    _Explanation (2026-09-17):_ after a scouter taps the field map for one action, any other
    position-requiring button pressed within one second reuses that tap instead of showing the
    map again, on the assumption the robot has not moved. GitHub issue #60 asks for the delay to
    be configurable; captured as BL-60 / SC-31a.

22. **Composite action-id scheme** (`<camelCase(phase/shift)><buttonId>`): is this scheme
    considered stable public behavior (configs depend on it), or would you prefer the rewrite
    to record the phase as a separate field (`{ id, phase, shift, ts }`) and derive composites
    in analysis?

    configs currently depend on this. New in 2026. Not sure how to make it generic moving forward.

23. **Hidden "catalog" layer** (layer 12): is this a known technique you want to keep, or would
    an explicit `knownActionIds` list in config be preferable?

    knownActionIds would be preferable. The hidden layers was a hack to populate the set of action IDs.

## D. Operations and environment

24. **Hosting in practice:** which deployment is actually used at events (Cloud Run, Render,
    a laptop on a hotspot, AWS)? This affects restart semantics, config persistence, and
    whether multi-instance support matters.

    We use AWS EC2; other teams may use GCP.

25. **Connectivity at events:** how often are scouters offline? Is the QR-code path used
    regularly or only as an emergency? Are there venues with no internet at all (server on a
    local network)?

    QR codes are only used when wifi or cell connectivity is not available. Even then, if the coverage is spotty, the client can cache data and then upload it all to the server at once. For example, a scouter can walk outside or to a different part of the building. That said, we have attended events where there is no connectivity at all, and we rely on the QR codes.

26. **Scale:** typical number of concurrent scouters/devices, TMPs per event, events per
    database, and seasons retained in one database.

    6 concurrent scouters plus 1-2 admins at a time. Last year, there was 75 matches; so, 450 TMPs. 6 events per database. New database each season. Can provide dump from MongoDB if helpful.

27. **Devices:** primary scouter devices (phones vs tablets, iOS vs Android, screen sizes) and
    whether the PWA install flow is actually used.

    Scouters primarily use personal phones. Not sure how common the PWA install flow is.

28. **Admin workflow:** does one admin drive match selection for the whole event, or do
    scouters self-select matches? Is the "6 scouters waiting → auto start" rule useful, or
    should admins always force-start?

    The admin responsibilities may be shared between 2-3 students. Scouters don't self select matches unless we are doing offline scouting. Not sure which approach is better.

29. **Multiple scouters per robot:** should duplicates be allowed (current behavior once every
    robot has one scouter) and how should analysis treat duplicate TMPs for the same
    robot/match (current: `removeDuplicates` keeps the latest timestamp)?

    Don't want the same team to be scouted more than once at a given time. We do want the ability to go back and rescout a match and have that more recent data replace the ealier data.

## E. Security and access

30. **Threat model:** is the server expected to be publicly reachable? Should scouters
    authenticate (per-scouter accounts, team PIN) and should read APIs (`/analysis/api/*`,
    `/admin/api/data`) be protected?

    The server is publicly reachable. Some authentication would be nice. We haven't had issues, but certainly could.

31. **Roles:** is a single shared access code sufficient, or do you want separate roles
    (admin vs strategy vs scouter)?

    Need t distinguish at least admin from other roles as is done currently.

32. **Setup wizard exposure:** is it acceptable that the wizard accepts an arbitrary MongoDB
    URL from the browser and that secrets are returned to the browser after entering the code?

    Recommendations for a more secure and yet easy getting started workflow would be appreciated.

## F. Data and analytics details

33. **Timestamps:** `ts` is milliseconds _remaining_ in the match. Keep counting down, or switch
    to elapsed time in the rewrite (with conversion for old data)?

    We are accustomed to counting down. If there is a good reason to change this behavior, we can be flexible.

34. **TBA score-breakdown enrichment:** the synthetic action ids (`endGameTowerRobot_Level2`,
    `autoTowerRobot_Level1`) come from raw TBA breakdown keys. Should this mapping be
    configurable per season (which keys to import, how to name them)?

    Definitely; I think that is the current behavior.

35. **OPR strings:** should the wizard offer the list of available COPR keys from TBA
    dynamically instead of a screenshot and free text?

    Not sure what this is referring to.

    _Explanation (2026-09-17):_ the "OPR strings" are the TBA component-OPR names (e.g.
    `Hub Total Fuel Count`) entered in setup and attached to teams as `opr.<name>`. The
    suggestion is to fetch the available names from TBA and offer a multi-select instead of a
    screenshot plus free text. Recorded as R-35 in document 12.

36. **Event switching in analysis** only affects analysis; the scouting client always writes to
    the configured event. Is that the intended model?

    Yes. We want to ensure every scouter is scouting the expected event. We also want the flexibility to look at data from other events throughout a competition.

37. **Team list gating:** teams with scouting data but not in the TBA/manual team list are
    hidden from the sidebar. Intentional?

    Intentional, but it shouldn't be needed.

38. **Cycle semantics:** `cycle` pairs each start with the first later end/miss; a start with no
    later end is dropped, and an end with no prior start is ignored. Confirm this is the
    intended definition of a cycle.

    Yes.

39. **Rating averages:** `sumAverage` derives count paths by naming convention
    (`counts.<phase>Rating<Metric><N>`). Should the rewrite require explicit `countPaths`
    instead of inferring from names?

    Not sure.

    _Recommendation (2026-09-17):_ keep name-convention inference as a convenience, require
    explicit `countPaths` when inference finds nothing, and validate in the config tests (T-3).

## G. Documentation discrepancies to resolve

40. The Configuration Guide says `totalTime` is in **seconds**; the code and 2026 config use
    **milliseconds**. Which should the rewrite adopt (and should it accept both)?

    The configuration guide is wrong. It shouldn't accept both.

41. The Configuration Guide's `cycle` options are `pickups`/`scores`/`misses`; the code uses
    `startAction`/`endAction`/`misses`. Should both spellings be supported?

    No, the code's terms are more generic. The guide is out of date.

42. The Usage Guide describes lock buttons on the manual schedule page and Google sign-in as
    upcoming; are these still planned?

    Not Google sign in. Not sure about manual scheduling features.

43. The README lists Render as the easy deployment target while `deploy/` contains only Google
    Cloud Run scripts. Which should the rewrite document and support?

    Make it easy for teams to use GCP. We will continue to use AWS EC2 and can do more manual steps.

44. The Quickstart references an AWS AMI "SPOT 1.0.1" and Glitch. Are these still supported
    paths?

    No.

## H. Quality bar

45. **Testing expectations:** _Answered 2026-09-16: automated tests are required so new
    features can be verified not to break existing ones without hand testing._ Captured as
    NF-8 (document 02) and T-1 to T-10 (document 12). Remaining sub-question: is a checked-in
    golden dataset of real (anonymized) TMPs from a past event available for the regression
    tests, or should synthetic data be generated? A golden dataset can be provided for a past season. That is only somewhat helpful as we often need to verify new features before any matches have occurred for the current season. In this case, a synthetic data set is needed.

46. **Accessibility / localization:** any requirements (color-blind palettes for red/blue,
    font sizes, languages)?

    Accessibility features help everyone. Localization is not a feature.

47. **Branding:** keep the SPOT name, logo, fonts (Cairo/Saira/Tajawal), and color palette?

    Keep the SPOT name and logo. Fonts and color palette can be changed.

## I. Proposed stack (Next.js, Tailwind/shadcn, SSE) — see document 15

48. **Hosting target for the rewrite:** _Answered 2026-09-16: Team 3061 will host on AWS EC2;
    other teams may host on Google Cloud. Serverless is out of scope._ Remaining sub-questions:
    will EC2 run Docker or bare Node, will nginx or an ALB front it, and is MongoDB Atlas the
    database on both clouds (assumed yes for all three)?

    EC2 runs bare node; nothing against Docker, however. nginx is used as a reverse proxy, MongoDB Atlas is used as the database in all cases.

49. **Extension model under Next.js:** is "drop a file in a folder **and add one import line**"
    acceptable for custom transformers, modules, and executables, or must runtime discovery of
    files be preserved?

    Perfer runtime discovery. Having a tool that updates code may be reasonable. Refer to answer to #1.

50. **Push latency:** is a 2–3 s delay between an admin action and scouters seeing their
    assignment acceptable (short polling), or is near-instant push (SSE) a requirement?

    2-3 delay is reasonable

51. **Button color classes in config:** may the rewrite change `class: "fuel2026"`-style names
    in `match-scouting.json` to explicit colors (with a converter for old configs), or must the
    existing class names keep working?

    Change be changed. Converter may not even be required.

52. **Google Cloud Run request timeout:** the deploy script sets 300 s; can it be raised for
    SSE streams, or should the client simply rely on automatic reconnection every 5 minutes?

    Can be changed.
