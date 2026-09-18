# 0005 Build-time registry with required option schemas

Status: Accepted 2026-09-17. Sources: document 15 part 2, answers 5 and 49, maintainer decision 2026-09-17.

## Context

"Extension" here means custom **code**: a new data transformer, a new analysis module, or a
new button executable. It does not mean editing the four JSON configuration files, which is
the primary customization path and stays available to students with no programming
experience.

In v5 such code is dropped into a folder and the server concatenates the folder's files at
request time into `/executables.js`, `/analysis/modules.js` and `/analysis/transformers.js`,
extracting marked regions. The CSV route goes further and evaluates a generated bundle on the
server. Next.js builds the client bundle ahead of time, so request-time stitching has no
equivalent.

The maintainer's position settles the trade-off: anyone writing a new transformer or module
has programming expertise, so requiring a rebuild is acceptable.

## Decision

Extensions are registered at build time. Adding one means writing the file and adding one
import line, then rebuilding and redeploying. There is no runtime folder scan, no public
runtime registration API, and no upload path in the admin UI. Installing an extension
requires filesystem access to the host.

Every extension transformer, module and executable **must** declare a JSON Schema for its
options, registered alongside it. Built-in options are already validated strictly; requiring
a schema means extension options are too, instead of being the one place where a typo is
silently ignored.

## Consequences

- Transformers and modules are ordinary TypeScript with real type checking, and their options
  are typed as well as schema-validated.
- Server-side evaluation of generated code disappears, closing that finding for good.
- A new extension cannot be added during an event without a deploy. This is acceptable:
  configuration, which covers the normal season workflow, still needs no rebuild.
- The registry index file is a merge-conflict point when several people add extensions at
  once. Keep it alphabetical and one import per line.
- CSV export moves to the client (see below), so transformers run in exactly one place.

## Related decision: client-side CSV

The v5 CSV route re-runs the pipeline on the server, fetching the dataset over HTTP from its
own endpoint and querying the same performances again from MongoDB, so every performance is
duplicated and a deduplication step cleans up after it. The export is an escape hatch for
ad-hoc analysis in a spreadsheet, and no one depends on its exact columns.

The dashboard has already computed everything the export needs, so the browser builds the
file from the in-memory dataset. This removes the duplication bug and the server-side
evaluation, lets the export work offline, and means the pipeline has a single execution
environment.
