/**
 * Extension executables (ADR 0005, #362). A guide is in docs/extension-executables.md.
 *
 * An extension is a file in this folder plus one line in this file:
 *
 *     export { myExecutable } from "./myExecutable";
 *
 * Keep the lines alphabetical, one per line, so that two people adding extensions at once rarely
 * conflict. Everything exported here is built into the app, a button can name it by `type`, and
 * the tests check it. `examples/` holds a worked example that is not registered.
 */
export {};
