/**
 * Extension transformers (ADR 0005, docs/spec/09 TR-14). A guide is in
 * docs/extension-transformers.md.
 *
 * An extension is a file in this folder plus one line in this file:
 *
 *     export { myTransformer } from "./myTransformer";
 *
 * Keep the lines alphabetical, one per line, so that two people adding extensions at once rarely
 * conflict. Everything exported here is registered beside the built-in transformers when the app
 * is built, and the tests check it. `examples/` holds a worked example that is not registered.
 */
export {};
