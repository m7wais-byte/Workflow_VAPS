/**
 * Planning estimates for the job progress overview: planned start, expected duration and expected completion.
 *
 * Convention: CALENDAR days, counting the start day. A 1-day activity starts and finishes on the same date;
 * a 3-day activity starting 10 Nov is expected to finish 12 Nov. Estimates never change operational records
 * (statuses, approvals or actual completion dates); they are a separate, editable plan.
 */
import { addDays } from './local-date';

export const dayConvention = 'calendar' as const;
export const dayConventionLabel = 'Calendar days, counting the start day';

export type ScheduleEstimate = {
  start?: string; days?: number; finish?: string;
  /** Shown in the client progress view. Off = internal planning only. */clientVisible: boolean;
  by: string; at: string;
};
export type EstimateInput = { start?: string; days?: string | number; finish?: string };

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v: string) => isoDate.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
/** Whole calendar days from a to b (b - a). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
/** Inclusive duration in calendar days. */
export const durationOf = (start: string, finish: string) => daysBetween(start, finish) + 1;
export const finishOf = (start: string, days: number) => addDays(start, days - 1);

/**
 * Validates an estimate and fills in the third value when two are known. Returns null when every field is empty
 * (the estimate is cleared). Throws a plain-language reason for inconsistent or negative values.
 */
export function normalizeEstimate(input: EstimateInput): { start?: string; days?: number; finish?: string } | null {
  const start = (input.start || '').trim(), finish = (input.finish || '').trim();
  const rawDays = typeof input.days === 'number' ? String(input.days) : (input.days || '').trim();
  if (!start && !finish && !rawDays) return null;
  if (start && !validDate(start)) throw Error('Enter the planned start as a valid date.');
  if (finish && !validDate(finish)) throw Error('Enter the expected completion as a valid date.');
  let days: number | undefined;
  if (rawDays) {
    if (!/^\d+$/.test(rawDays)) throw Error('Enter the expected duration as a whole number of days (1 or more). Negative or decimal durations are not accepted.');
    days = Number(rawDays);
    if (days < 1 || days > 3650) throw Error('The expected duration must be between 1 and 3650 calendar days.');
  }
  if (start && finish) {
    if (finish < start) throw Error('The expected completion cannot be before the planned start.');
    const span = durationOf(start, finish);
    if (days !== undefined && days !== span) throw Error(`Planned start, duration and expected completion do not agree: ${start} to ${finish} is ${span} calendar day${span === 1 ? '' : 's'} (counting the start day). Correct one value or leave one empty.`);
    return { start, days: span, finish };
  }
  if (start && days !== undefined) return { start, days, finish: finishOf(start, days) };
  if (finish && days !== undefined) return { start: addDays(finish, -(days - 1)), days, finish };
  return { ...(start ? { start } : {}), ...(days !== undefined ? { days } : {}), ...(finish ? { finish } : {}) };
}

/** Keys of planning rows: sampling, sample receipt, final report and one key per laboratory activity row. */
export const estimateKeyPattern = /^(sampling|transfer|receipt|report|lab:(PVT|Chemical):.{1,240})$/;
