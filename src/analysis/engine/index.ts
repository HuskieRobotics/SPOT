/**
 * The SPOT analysis engine (Phase 1, docs/spec/17): builds the dataset from stored performances
 * and runs the analysis pipeline over it. Pure TypeScript, so the same code runs in the browser
 * dashboard and in Node (tests, `config:check`, `config:preview`).
 */
export * from "./dataset";
export * from "./path";
export * from "./registry";
export * from "./run";
