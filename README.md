<div align="center">
  <img src="public/img/SPOTBanner.jpg" width="50%">
</div>

# SPOT — Scouting Platforms On Time (v6, in development)

SPOT is an open-source, configuration-driven match-scouting platform for FRC, developed by
Team 3061 Huskie Robotics. **This branch is the v6 rewrite** (Next.js, Tailwind/shadcn,
MongoDB). It is not yet usable at events.

- The current production app (v5, Express/EJS) is on `main` until cutover and on the `v5`
  branch afterwards. Its documentation links are in that branch's README.
- Students configuring SPOT for a game: start with the
  [Configuration Guide](docs/configuration-guide/README.md).
- The full requirements specification for the rewrite is in [`docs/spec/`](docs/spec/README.md).
- The legacy behavioral oracle (golden analysis output for 2025 and 2026 real data, plus synthetic sets for both seasons) is in
  [`tools/oracle/`](tools/oracle/README.md).
- Legacy v1 configuration files (2022–2026) are in [`config/v1/`](config/v1/README.md).

## Status

Phases 0 (preparation) and 1 (core engine) are complete, and so is gate K: students can write
a new game's configuration, check it, and preview it before any match is played. Phase 2 (the
scouting vertical slice) is next, aimed at gate W, testing v6 beside v5 at Week 0. Live status
is in `docs/spec/17-rewrite-plan-and-next-steps.md` §5, and work is tracked by the "v6 Phase N"
milestones on GitHub. The app skeleton, test tooling, and CI verify every pull request
automatically (`docs/spec/02-architecture.md`, NF-8).

## Getting started (developers)

```sh
node -v            # Node 24 (see .nvmrc)
npm ci
cp .env.example .env.local   # fill in values
npm run dev        # http://localhost:3000
```

Quality gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
`npm run test:e2e` (Playwright, Chromium).

### From VS Code's Run and Debug list

`.vscode/launch.json` puts these commands in VS Code's **Run and Debug** list (Ctrl+Shift+D), so
nobody has to remember or type them (NF-13). Choose an entry and press F5. Each runs with the
debugger attached, so a breakpoint in a script or a test stops there. The three entries that
start SPOT run Next directly and show its output in the Debug Console, because VS Code opens the
browser only for an address printed there, not in a terminal. The others run their npm script
in a terminal. Next runs one dev server per folder, so stop **Run SPOT** before starting
**Debug SPOT in Chrome** or the preview; a second one exits.

| Entry                                                | Notes                                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Run SPOT (npm run dev)**                           | Opens the home page in the default browser once the server is ready.                                                                                                                                  |
| **Scouting-screen preview (npm run dev)**            | The same, opening `/scouting-preview`.                                                                                                                                                                |
| **Debug SPOT in Chrome**                             | Starts the dev server and a Chrome window that VS Code controls, so breakpoints stop in both server and browser code (Next's debugging guide). For Edge, change `debugWithChrome` to `debugWithEdge`. |
| **Check a season (npm run config:check)**            | Asks for the folder.                                                                                                                                                                                  |
| **Preview a season (npm run config:preview)**        | Asks for the folder and how much to show.                                                                                                                                                             |
| **Unit tests (npm test)**                            | All of them.                                                                                                                                                                                          |
| **Unit tests in the open file (npm test)**           | The test file in the editor. Set a breakpoint first to step through a test.                                                                                                                           |
| **Browser tests (npm run test:e2e)**                 | Needs `npx playwright install chromium` once, and either SPOT running (**Run SPOT**) or a build (**Build SPOT**).                                                                                     |
| **Compare with the oracle (npm run oracle:compare)** | Every set.                                                                                                                                                                                            |
| **Lint (npm run lint)**                              |                                                                                                                                                                                                       |
| **Typecheck (npm run typecheck)**                    |                                                                                                                                                                                                       |
| **Format every file (npm run format)**               |                                                                                                                                                                                                       |
| **Build SPOT (npm run build)**                       |                                                                                                                                                                                                       |

Each entry runs one npm script. None chains commands with `&&`, because Windows PowerShell 5.1,
the default terminal on many school computers, refuses it. Commands with other arguments
(`config:convert`, `oracle`, `migrate`, `generate`) are still typed.

## Deployment targets

AWS EC2 (Team 3061) and Google Cloud (other teams). Recipes live under `deploy/`; the app is
cloud-neutral and runs as plain Node (`npm run build && npm start`), no Docker required.

## Contributing

See `.github/CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `CLAUDE.md` (working rules,
including citing requirement ids in pull requests). License: Apache 2.0.
