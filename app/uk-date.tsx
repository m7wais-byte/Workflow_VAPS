"use client";
// UK date standard for the whole app: dd/mm/yyyy and 24-hour time, whatever the browser's own language is.
// Values are still stored as ISO (YYYY-MM-DD / HH:MM / ISO timestamps); only what people see and type changes.
import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";

import { ukDate, parseUkDate, parseUkTime } from "./uk-format";
export { ukDate, ukTime, ukDateTime, parseUkDate, parseUkTime } from "./uk-format";

type ValueEvent = { target: { value: string }; currentTarget: { value: string } };
type FieldProps = {
  value: string;
  onChange?: (event: ValueEvent) => void;
  onBlur?: (event: ValueEvent) => void;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
};
const asEvent = (value: string): ValueEvent => ({ target: { value }, currentTarget: { value } });

/** Date field that always shows and accepts dd/mm/yyyy; the calendar button opens the browser's date picker. */
export function DateInput({ value, onChange, onBlur, required, disabled, min, max, id, className, ...rest }: FieldProps) {
  const [text, setText] = useState(ukDate(value));
  const [invalid, setInvalid] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  // Follow value changes made outside the field (e.g. loading another job).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setText(ukDate(value)); setInvalid(false); }, [value]);
  const commit = (raw: string, blur: boolean) => {
    if (!raw.trim()) { setInvalid(false); if (value) onChange?.(asEvent("")); if (blur) onBlur?.(asEvent("")); return; }
    const iso = parseUkDate(raw);
    const outOfRange = Boolean(iso && ((min && iso < min) || (max && iso > max)));
    if (iso && !outOfRange) { setInvalid(false); if (iso !== value) onChange?.(asEvent(iso)); if (blur) { setText(ukDate(iso)); onBlur?.(asEvent(iso)); } }
    else if (blur) setInvalid(true);
  };
  return <span className={"uk-date-input" + (invalid ? " invalid" : "") + (className ? " " + className : "")}>
    <input id={id} type="text" inputMode="numeric" placeholder="dd/mm/yyyy" pattern="\d{1,2}/\d{1,2}/\d{4}" title="Date as dd/mm/yyyy" required={required} disabled={disabled} aria-label={rest["aria-label"]} aria-invalid={invalid || undefined}
      value={text} onChange={(e) => { setText(e.target.value); if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(e.target.value.trim())) commit(e.target.value, false); }} onBlur={(e) => commit(e.target.value, true)} />
    <button type="button" className="uk-date-picker" disabled={disabled} aria-label="Open calendar" onClick={() => { const el = picker.current; if (!el) return; try { el.showPicker(); } catch { el.focus(); el.click(); } }}><CalendarDays size={16} aria-hidden="true" /></button>
    <input ref={picker} type="date" tabIndex={-1} aria-hidden="true" className="uk-date-native" value={value || ""} min={min} max={max} disabled={disabled} onChange={(e) => { setText(ukDate(e.target.value)); setInvalid(false); onChange?.(asEvent(e.target.value)); onBlur?.(asEvent(e.target.value)); }} />
    {invalid && <small className="uk-date-error">Use dd/mm/yyyy{min ? `, from ${ukDate(min)}` : ""}</small>}
  </span>;
}

/** Time picked from two lists, hour (00–23) and minute (00–59), always 24-hour; Now fills the current time. */
export function TimeInput({ value, onChange, onBlur, required, disabled, id, className, ...rest }: FieldProps) {
  const split = (v?: string) => { const t = v ? parseUkTime(v) : null; return t ? t.split(":") : ["", ""]; };
  const [hour, setHour] = useState(split(value)[0]);
  const [minute, setMinute] = useState(split(value)[1]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const [h, m] = split(value); if (value || (!hour && !minute)) { setHour(h); setMinute(m); } }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const emit = (h: string, m: string) => { const next = h && m ? `${h}:${m}` : ""; if (next !== (value || "")) onChange?.(asEvent(next)); onBlur?.(asEvent(next)); };
  const label = rest["aria-label"] || "Time";
  const pad = (n: number) => String(n).padStart(2, "0");
  return <span className={"uk-time-pick" + (className ? " " + className : "")}>
    <select id={id} aria-label={label + " · hour"} required={required} disabled={disabled} value={hour} onChange={(e) => { setHour(e.target.value); const m = minute || (e.target.value ? "00" : ""); setMinute(m); emit(e.target.value, m); }}><option value="">HH</option>{Array.from({ length: 24 }, (_, n) => <option key={n} value={pad(n)}>{pad(n)}</option>)}</select>
    <b aria-hidden="true">:</b>
    <select aria-label={label + " · minute"} required={required} disabled={disabled} value={minute} onChange={(e) => { setMinute(e.target.value); emit(hour, e.target.value); }}><option value="">MM</option>{Array.from({ length: 60 }, (_, n) => <option key={n} value={pad(n)}>{pad(n)}</option>)}</select>
    <button type="button" className="uk-time-now" disabled={disabled} onClick={() => { const d = new Date(), h = pad(d.getHours()), m = pad(d.getMinutes()); setHour(h); setMinute(m); emit(h, m); }}>Now</button>
    <small className="uk-time-hint">24-hour</small>
  </span>;
}
