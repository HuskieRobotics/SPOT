/**
 * Built-in transformers (docs/spec/09). Registered here, one import per line, alphabetical
 * (ADR 0005). Issues #311 to #315 add them.
 */
import { TransformerRegistry, type Transformer } from "../engine/registry";
import { countActionsTeam, countActionsTmp } from "./countActions";

export const builtInTransformers: readonly Transformer[] = [countActionsTmp, countActionsTeam];

/** A registry holding every built-in transformer. */
export function createRegistry(extra: readonly Transformer[] = []): TransformerRegistry {
  return new TransformerRegistry([...builtInTransformers, ...extra]);
}
