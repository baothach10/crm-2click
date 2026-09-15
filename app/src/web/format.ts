const ROME_TZ = "Europe/Rome";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: ROME_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const moneyFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

const numberFormatter = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// `value` is a plain "YYYY-MM-DD" string (see pool.ts's date type-parser override) --
// a calendar date has no time-of-day or zone, so this is a pure string reformat, not a
// timezone conversion.
export function formatDate(value: string | null): string {
  if (value === null) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function formatDateTime(value: Date | string | null): string {
  if (value === null) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return dateTimeFormatter.format(date).replace(",", "");
}

// pg returns `numeric` columns as strings to avoid float precision loss on the wire;
// Number() is fine here since this is display-only formatting, never arithmetic.
export function formatMoney(value: string | null): string {
  if (value === null) return "—";
  return moneyFormatter.format(Number(value));
}

export function formatNumber(value: string | null, unit: string): string {
  if (value === null) return "—";
  return `${numberFormatter.format(Number(value))} ${unit}`;
}
