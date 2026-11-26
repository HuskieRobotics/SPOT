# SPOT Configuration Guide

Every season, the game changes, and so does SPOT. You don't change SPOT's code to do that. You
change four **configuration files**. They decide:

- which buttons a scouter sees during a match, and when;
- what SPOT calculates from what the scouters recorded;
- what the analysis pages show about each team.

This guide is for students who have never edited these files, or any code. If you can follow a
recipe, you can follow this guide.

**Start with [Your first change](tutorial.md).** In about 25 minutes you add a button to a copy
of the 2025 configuration, press it on the scouting screen, and see it counted on the analysis
page. The rest of the guide
explains each part in more detail.

## The three files

The files for the season SPOT is using right now are in the `config/` folder:

| File                     | What it decides                                                                 | Chapter                                       |
| ------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------- |
| `match-scouting.json`    | The buttons on the scouting screen, the match timing, and the rules for undoing | [Match scouting](match-scouting.md)           |
| `analysis-pipeline.json` | The calculations SPOT runs on the recorded actions                              | [The analysis pipeline](analysis-pipeline.md) |
| `analysis-modules.json`  | The charts and numbers the analysis pages show                                  | [Analysis modules](analysis-modules.md)       |

Past seasons are kept in `config/seasons/<year>/`, so you can look at how an earlier game was
set up, and the analysis pages read that year's events with them. `config/seasons/2025/` is the
best example of a typical game.

## What you need

- **Visual Studio Code** (VS Code), with the SPOT folder open.
- **Node 24**, and `npm install` run once in the SPOT folder. Ask a mentor if `npm` is not
  found.
- A terminal. In VS Code, choose **Terminal → New Terminal**. Every command in this guide is
  typed there and starts with `npm run`.

### Or pick a command from a list

You can run the commands you use most without typing them. Open **Run and Debug** (the ▷ with a
bug on the left edge of VS Code, or Ctrl+Shift+D), choose an entry from the list at the top, and
press the green ▷ next to it (or F5). VS Code opens a terminal and runs the command there, the
same as if you had typed it.

| Entry                                         | What it does                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Check a season (npm run config:check)**     | Asks which folder, then checks it.                                                                                                               |
| **Preview a season (npm run config:preview)** | Asks which folder, and whether you want the short preview, every value (`--all`), or one team's page (`--team 3061`).                            |
| **Scouting-screen preview (npm run dev)**     | Starts SPOT and, once it is ready, opens the [scouting-screen preview](checking-and-preview.md#the-scouting-screen-preview) in your web browser. |
| **Run SPOT (npm run dev)**                    | Starts SPOT and opens its home page.                                                                                                             |

The folder list offers `config` (the season SPOT uses), your `config/seasons/practice` copy from
the [tutorial](tutorial.md), and `config/seasons/2025`. For any other folder or option, type
the command.

The two entries that start SPOT show its messages in the **Debug Console** panel instead of a
terminal. Only one SPOT can run at a time, so stop it before starting it again from another
entry: press the red square in the bar at the top of the window (Shift+F5).

The other entries in the list are for programmers; the [main README](../../README.md#from-vs-codes-run-and-debug-list)
explains them.

## JSON in five minutes

The files are written in **JSON**, a way of writing down information that both people and
programs can read. You only need a few pieces:

```json
{
  "label": "Defense",
  "gridArea": [2, 4, 3, 7],
  "executables": [],
  "alternate": true
}
```

- `{ ... }` is an **object**: a set of names, each with a value. The names are in double
  quotes, followed by a colon.
- `[ ... ]` is a **list**: values in order, separated by commas. `[]` is an empty list.
- Text is in double quotes (`"Defense"`). Numbers are not (`25000`). `true` and `false` are
  written without quotes.
- Items are separated by commas, **but there is no comma after the last one**. A missing or
  extra comma is the most common mistake; VS Code underlines it in red.

Each file starts with a `"$schema"` line. It tells VS Code what the file may contain, so VS
Code helps you while you type:

- A **red squiggle** marks a mistake. Hover over it to read what is wrong.
- **Hover** over a name, such as `"gridArea"`, to read what it means.
- Press **Ctrl+Space** inside an object (on a Mac too) to see which names you can add.

## The three steps you repeat

1. **Edit** a file in VS Code and save it.
2. **Check** the files: `npm run config:check`. It reads all three files, checks that they agree
   with each other, and runs the calculations on 120 made-up matches. Every problem comes with
   the file, the line, what is wrong, and what to try. See
   [Checking and previewing](checking-and-preview.md).
3. **Preview** the result: `npm run config:preview`. It plays 80 made-up matches with your
   buttons and shows what each calculation produces and what each chart on the analysis pages
   would show. For `match-scouting.json`, also look at the screen itself in the
   [scouting-screen preview](checking-and-preview.md#the-scouting-screen-preview), a page where
   you play a match on your buttons.

You can do all of this before a single real match is played, which is the point: right after
kickoff you can build the new game's configuration and know it works.

To check or preview another folder, put it after `--`:

```sh
npm run config:check -- config/seasons/2025
npm run config:preview -- config/seasons/2025
```

## Words this guide uses

| Word            | Meaning                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **button**      | One box on the scouting screen. Each has an **id**, such as `teleopl4`, which is how SPOT refers to it.                                           |
| **action**      | One press of an action button, recorded with the time it happened: "scored on L4 with 87 seconds left".                                           |
| **layer**       | One screen of buttons. Pressing a button can switch to another layer.                                                                             |
| **phase**       | A period of the match the clock decides: auto, teleop, endgame.                                                                                   |
| **segment**     | A smaller period inside a phase, such as 2026's shifts. Most games have none. See [Periods](periods.md).                                          |
| **performance** | Everything one scouter recorded about one robot in one match. The files sometimes call it a **tmp** (team match performance).                     |
| **team value**  | A number SPOT works out for a team from all of its performances, such as its average score.                                                       |
| **path**        | Where a value lives, written with dots: `counts.teleopl4` is the value `teleopl4` inside `counts`.                                                |
| **entry**       | One step in `analysis-pipeline.json`: one calculation, such as "add these counts together". Each uses a **transformer**, the kind of calculation. |
| **module**      | One chart, table or number on an analysis page, set up in `analysis-modules.json`.                                                                |

## Chapters

1. [Your first change](tutorial.md): a hands-on walk-through.
2. [Match scouting](match-scouting.md): buttons, layers, timing and rules (`match-scouting.json`) and [QR codes](match-scouting.md#qr-codes).
3. [Periods](periods.md): phases, segments and kinds, and analyzing one period at a time.
4. [The analysis pipeline](analysis-pipeline.md): the calculations (`analysis-pipeline.json`).
5. [Analysis modules](analysis-modules.md): what the analysis pages show (`analysis-modules.json`).
6. [Checking and previewing](checking-and-preview.md): `config:check`, `config:preview` and the scouting-screen preview, and what their messages mean.
7. [Starting a new season](new-season.md): from kickoff to Week 0.
8. [New-game checklist](new-game-checklist.md): the same, as a list to tick off.

Students who can program can also add new kinds of calculations; see
[Extension transformers](../extension-transformers.md).
