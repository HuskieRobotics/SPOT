/**
 * Extension modules (ADR 0005, #391). A guide is in docs/extension-modules.md.
 *
 * An extension is a file in this folder plus one line in this file:
 *
 *     export { myModule } from "./myModule";
 *
 * Keep the lines alphabetical, one per line, so that two people adding extensions at once rarely
 * conflict. Everything exported here is built into the app, an entry of analysis-modules.json can
 * name it by `module`, and the tests check it. `examples/` holds a worked example that is not
 * registered. Nothing here says "use client": config:check reads these on the server too.
 */
export {};
