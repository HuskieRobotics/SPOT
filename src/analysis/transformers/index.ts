/**
 * Built-in transformers (docs/spec/09), registered here one import per line, alphabetical
 * (ADR 0005), and the registry that holds them with the extension transformers
 * (src/analysis/extensions, TR-14).
 */
import { registryKey, TransformerRegistry, type Transformer } from "../engine/registry";
import * as extensions from "../extensions";
import { actionSequenceTransformers } from "./actionSequence";
import { aggregationTransformers } from "./aggregation";
import { arithmeticTransformers } from "./arithmetic";
import { countActionsTeam, countActionsTmp } from "./countActions";
import { lookupTransformers } from "./lookup";

export const builtInTransformers: readonly Transformer[] = [
  ...actionSequenceTransformers,
  ...aggregationTransformers,
  ...arithmeticTransformers,
  countActionsTeam,
  countActionsTmp,
  ...lookupTransformers,
];

/** Every transformer exported from src/analysis/extensions/index.ts. */
export const extensionTransformers: readonly Transformer[] = Object.values(
  extensions satisfies Record<string, Transformer>,
);

/**
 * A registry holding every built-in and extension transformer, plus `extra` extensions (tests).
 * An extension cannot take a built-in transformer's name, even for the other entry type: the
 * pipeline schema checks a built-in's options by name alone, so an editor would apply the
 * built-in's options to the extension's entries.
 */
export function createRegistry(extra: readonly Transformer[] = []): TransformerRegistry {
  const builtInNames = new Set(builtInTransformers.map((t) => t.name));
  const added = [...extensionTransformers, ...extra];
  for (const t of added) {
    if (builtInNames.has(t.name)) {
      throw new Error(
        `extension transformer ${registryKey(t.type, t.name)}: "${t.name}" is the name of a built-in transformer; choose another name`,
      );
    }
  }
  return new TransformerRegistry([...builtInTransformers, ...added]);
}
