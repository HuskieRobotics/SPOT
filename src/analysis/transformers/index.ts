/**
 * Built-in transformers (docs/spec/09). Registered here, one import per line, alphabetical
 * (ADR 0005). Issues #311 to #315 add them.
 */
import { TransformerRegistry, type Transformer } from "../engine/registry";
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

/** A registry holding every built-in transformer. */
export function createRegistry(extra: readonly Transformer[] = []): TransformerRegistry {
  return new TransformerRegistry([...builtInTransformers, ...extra]);
}
