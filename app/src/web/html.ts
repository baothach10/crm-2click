// A tiny auto-escaping HTML template helper. Interpolated values are escaped by default;
// wrap pre-built markup in raw() to insert it verbatim (e.g. composing fragments).
export class SafeHtml {
  constructor(public readonly value: string) {}
}

export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
}

export const empty = raw("");

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stringifyValue(value: unknown): string {
  if (value instanceof SafeHtml) {
    return value.value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(stringifyValue).join("");
  }
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    out += stringifyValue(values[i]);
    out += strings[i + 1] ?? "";
  }
  return new SafeHtml(out);
}

export function join(items: SafeHtml[], separator: SafeHtml = empty): SafeHtml {
  return raw(items.map((i) => i.value).join(separator.value));
}
