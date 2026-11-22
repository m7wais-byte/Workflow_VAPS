import { appStorage } from './app-storage';
// Units each client works in (Settings → Clients). The sampling data sheet opens in the client's units;
// every other unit stays available in the unit dropdown of each field.

export type UnitQuantity = 'pressure' | 'temperature' | 'depth' | 'gasRate' | 'liquidRate' | 'gor' | 'cgr';
export type ClientUnits = Record<UnitQuantity, string>;

export const unitQuantities: { key: UnitQuantity; label: string; options: string[] }[] = [
  { key: 'pressure', label: 'Pressure', options: ['psi', 'psia', 'psig', 'bar', 'barg', 'kPa', 'MPa'] },
  { key: 'temperature', label: 'Temperature', options: ['°C', '°F', 'K'] },
  { key: 'depth', label: 'Depth', options: ['m', 'ft'] },
  { key: 'gasRate', label: 'Gas rate', options: ['MMscf/d', 'Mscf/d', 'scf/d', 'Sm³/d', 'm³/d', 'MSm³/d'] },
  { key: 'liquidRate', label: 'Oil / water rate', options: ['STB/d', 'bbl/d', 'm³/d', 'Sm³/d', 'L/min'] },
  { key: 'gor', label: 'GOR', options: ['scf/STB', 'Sm³/Sm³', 'm³/m³', 'Mscf/STB'] },
  { key: 'cgr', label: 'CGR', options: ['STB/MMscf', 'bbl/MMscf', 'Sm³/MSm³', 'm³/m³'] },
];

/** One-click presets; each quantity can still be changed for clients who mix systems (for example kPa with °C). */
export const unitPresets: Record<'Field' | 'Metric', ClientUnits> = {
  Field: { pressure: 'psi', temperature: '°F', depth: 'ft', gasRate: 'MMscf/d', liquidRate: 'STB/d', gor: 'scf/STB', cgr: 'STB/MMscf' },
  Metric: { pressure: 'kPa', temperature: '°C', depth: 'm', gasRate: 'Sm³/d', liquidRate: 'Sm³/d', gor: 'Sm³/Sm³', cgr: 'Sm³/MSm³' },
};

/** Which preset the units match, or Custom when a quantity was changed. */
export const presetOf = (units?: ClientUnits) => !units ? '' : (Object.keys(unitPresets) as (keyof typeof unitPresets)[]).find((name) => unitQuantities.every((q) => unitPresets[name][q.key] === units[q.key])) || 'Custom';
export const unitsSummary = (units?: ClientUnits) => units ? `${presetOf(units)} · ${units.pressure}, ${units.temperature}, ${units.depth}` : 'Not set';

/** Units saved for a client in Settings → Clients, read from this browser's client list. Undefined when none are set. */
export function storedClientUnits(clientCode?: string): ClientUnits | undefined {
  const store = appStorage();
  if (!clientCode || !store) return undefined;
  try { const list = JSON.parse(store.getItem('vaps-demo-clients-v1') || '[]'); const found = Array.isArray(list) ? list.find((c) => c && c.code === clientCode) : undefined; return found?.units || undefined; } catch { return undefined; }
}

/** Data sheet value field → quantity. The unit is stored next to the value as `<field>Unit`. */
const fieldQuantity: Record<string, UnitQuantity> = {
  bhp: 'pressure', whp: 'pressure', separatorPressure: 'pressure', gasDifferentialPressure: 'pressure', gasPressure: 'pressure', openingPressureReservoir: 'pressure', openingPressureAmbient: 'pressure', transferPressure: 'pressure', finalPressure: 'pressure',
  bht: 'temperature', wht: 'temperature', separatorTemperature: 'temperature', oilLineTemperature: 'temperature', gasTemperature: 'temperature', openingTemperatureReservoir: 'temperature', openingTemperatureAmbient: 'temperature', transferTemperature: 'temperature', finalTemperature: 'temperature',
  depth: 'depth', perforations: 'depth',
  gasRate: 'gasRate', oilRate: 'liquidRate', waterRate: 'liquidRate', gor: 'gor', cgr: 'cgr',
};

/** The client's unit for a data sheet or job-context field, or undefined when the client has no unit for it. */
export function clientUnitFor(field: string, units?: ClientUnits): string | undefined {
  const quantity = fieldQuantity[field];
  if (!units || !quantity || !units[quantity]) return undefined;
  return field === 'perforations' ? units.depth + ' MD' : units[quantity];
}

/**
 * Sets the client's units on a data sheet. Only fields with no value yet are changed (N/A counts as no value),
 * so a value that was already entered keeps the unit it was entered in.
 */
export function applyClientUnits(fieldData: Record<string, string>, units?: ClientUnits, depthValue = ''): Record<string, string> {
  if (!units) return fieldData;
  const next = { ...fieldData };
  for (const field of Object.keys(fieldQuantity)) {
    const value = (field === 'depth' ? depthValue : fieldData[field] || '').trim();
    const unit = clientUnitFor(field, units);
    if (unit && (!value || value.toUpperCase() === 'N/A')) next[field + 'Unit'] = unit;
  }
  return next;
}
