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

/** Time field that always shows and accepts 24-hour HH:MM. */
export function TimeInput({ value, onChange, onBlur, required, disabled, id, className, ...rest }: FieldProps) {
  const [text, setText] = useState(value || "");
  const [invalid, setInvalid] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setText(value || ""); setInvalid(false); }, [value]);
  const commit = (raw: string, blur: boolean) => {
    if (!raw.trim()) { setInvalid(false); if (value) onChange?.(asEvent("")); if (blur) onBlur?.(asEvent("")); return; }
    const t = parseUkTime(raw);
    if (t) { setInvalid(false); if (t !== value) onChange?.(asEvent(t)); if (blur) { setText(t); onBlur?.(asEvent(t)); } }
    else if (blur) setInvalid(true);
  };
  return <span className={"uk-date-input uk-time-input" + (invalid ? " invalid" : "") + (className ? " " + className : "")}>
    <input id={id} type="text" inputMode="numeric" placeholder="HH:MM (24h)" title="Time as HH:MM, 24-hour" required={required} disabled={disabled} aria-label={rest["aria-label"]} aria-invalid={invalid || undefined}
      value={text} onChange={(e) => { setText(e.target.value); if (/^\d{1,2}:\d{2}$/.test(e.target.value.trim())) commit(e.target.value, false); }} onBlur={(e) => commit(e.target.value, true)} />
    {invalid && <small className="uk-date-error">Use 24-hour HH:MM</small>}
  </span>;
}
