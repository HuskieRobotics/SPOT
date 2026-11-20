/**
 * JSON for config:check (#317): parse a configuration file with an error a student can act on,
 * and find the line of any value so a finding can say where to look.
 */

export type Key = string | number;

export interface Position {
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
}

export type Parsed =
  { ok: true; value: unknown } | { ok: false; message: string; hint?: string; position: Position };

/** Line and column of a character offset. */
export function positionAt(text: string, offset: number): Position {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

const previousNonSpace = (text: string, offset: number): string => {
  for (let i = offset - 1; i >= 0; i--) if (!/\s/.test(text[i])) return text[i];
  return "";
};

/**
 * Parse JSON. On a syntax error, say where, in Node's words without the offset, plus a hint for
 * the mistakes people make when editing JSON by hand.
 */
export function parseJson(source: string): Parsed {
  const text = source.replace(/^﻿/, "");
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const at = /position (\d+)/.exec(raw);
    const offset = at ? Number(at[1]) : text.length;
    const message = raw
      .replace(/ in JSON at position \d+.*$/, "")
      .replace(/^JSON\.parse: /, "")
      .trim();
    const next = text[offset] ?? "";
    let hint: string | undefined;
    if ((next === "}" || next === "]") && previousNonSpace(text, offset) === ",") {
      hint = "JSON does not allow a comma after the last item. Delete that comma.";
    } else if (next === "/") {
      hint =
        'JSON does not allow comments. Delete it; a pipeline entry can carry a "comment" property instead.';
    } else if (next === "'") {
      hint = 'JSON strings use double quotes ("), not single quotes.';
    } else if (offset >= text.length) {
      hint = "The file ends too early: a closing } or ] is missing.";
    } else if (/after (property value|array element)/.test(raw)) {
      hint = "A comma is probably missing between two items, at the end of the line before.";
    } else if (/property name/.test(raw) && /[A-Za-z_$]/.test(next)) {
      hint = 'Property names need double quotes: "name": …';
    }
    return { ok: false, message, hint, position: positionAt(text, offset) };
  }
}

/** JSON pointer for a list of keys (`["pipeline", 5, "options"]` → `/pipeline/5/options`). */
export function toPointer(keys: readonly Key[]): string {
  return keys.map((k) => `/${String(k).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

/**
 * Where every value and every object member starts, by JSON pointer: a member at its key, an
 * array item at its value. The text must already be valid JSON (`parseJson` succeeded).
 */
export function indexPositions(source: string): Map<string, number> {
  const text = source.replace(/^﻿/, "");
  const shift = source.length - text.length;
  const at = new Map<string, number>();
  let i = 0;
  const space = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const string = (): string => {
    const start = i++;
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (pointer: string): void => {
    space();
    if (!at.has(pointer)) at.set(pointer, i + shift);
    const c = text[i];
    if (c === "{" || c === "[") {
      const close = c === "{" ? "}" : "]";
      i++;
      space();
      if (text[i] === close) {
        i++;
        return;
      }
      for (let n = 0; ; n++) {
        space();
        if (c === "{") {
          const keyStart = i;
          const key = string();
          const child = `${pointer}${toPointer([key])}`;
          at.set(child, keyStart + shift);
          space();
          i++; // ":"
          value(child);
        } else {
          value(`${pointer}/${n}`);
        }
        space();
        if (text[i++] !== ",") return;
      }
    }
    if (c === '"') {
      string();
      return;
    }
    while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
  };
  value("");
  return at;
}

/**
 * The position of the value at `keys`, or of its nearest ancestor that exists (a missing
 * property is reported where its object starts).
 */
export function locate(
  source: string,
  index: Map<string, number>,
  keys: readonly Key[],
): Position | null {
  for (let n = keys.length; n >= 0; n--) {
    const offset = index.get(toPointer(keys.slice(0, n)));
    if (offset !== undefined) return positionAt(source, offset);
  }
  return null;
}

/** Keys for an Ajv instance path, with array indexes as numbers. */
export function keysFromPointer(doc: unknown, pointer: string): Key[] {
  if (!pointer) return [];
  const keys: Key[] = [];
  let current: unknown = doc;
  for (const raw of pointer.slice(1).split("/")) {
    const part = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    const key: Key = Array.isArray(current) && /^\d+$/.test(part) ? Number(part) : part;
    keys.push(key);
    current =
      current !== null && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined;
  }
  return keys;
}
