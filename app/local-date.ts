/** Calendar date (YYYY-MM-DD) in the user's own time zone, not UTC. */
export const localDate = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
/** Adds whole calendar days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number) { const value = new Date(`${date}T00:00:00`); value.setDate(value.getDate() + days); return localDate(value); }
