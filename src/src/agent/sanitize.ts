/**
 * Strict tool use occasionally makes the model double-escape punctuation in
 * its JSON — literal `–` sequences (and stray `\,`-style escapes) land
 * in the parsed strings and would leak into workpapers. Decode them in
 * narrative tool inputs. Never applied to query_data code, which must reach
 * the sandbox exactly as written.
 */
export function decodeModelText<T>(input: T): T {
  return walk(input) as T;
}

function walk(value: unknown): unknown {
  if (typeof value === "string") return decodeString(value);
  if (Array.isArray(value)) return value.map(walk);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
  }
  return value;
}

function decodeString(text: string): string {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\([,;:.!?)])/g, "$1");
}
