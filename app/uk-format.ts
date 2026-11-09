// UK date standard: dd/mm/yyyy and 24-hour time, independent of the browser language. Stored values stay ISO.
export const pad = (n: number) => String(n).padStart(2, "0");
const parse = (value: string) => new Date(value.length === 10 ? value + "T00:00:00" : value);

/** dd/mm/yyyy for an ISO date or timestamp; "" when empty or invalid. */
export function ukDate(value?: string | null) {
  if (!value) return "";
  const d = parse(value);
  return Number.isFinite(d.getTime()) ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "";
}
/** HH:MM (24-hour) for an ISO timestamp. */
export function ukTime(value?: string | null) {
  if (!value) return "";
  const d = parse(value);
  return Number.isFinite(d.getTime()) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
}
/** dd/mm/yyyy HH:MM (24-hour) for an ISO timestamp. */
export function ukDateTime(value?: string | null) {
  const date = ukDate(value);
  return date ? `${date} ${ukTime(value)}` : "";
}

/** Reads dd/mm/yyyy (also d/m/yyyy, dd-mm-yyyy, dd.mm.yyyy) into YYYY-MM-DD; null when it is not a real date. */
export function parseUkDate(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}
/** Reads HH:MM (24-hour, also H:MM or HHMM) into HH:MM; null when invalid. */
export function parseUkTime(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

