/**
 * A sample is held in a cylinder (from the cylinder inventory), a glass bottle or an IATA can.
 * Glass bottles and IATA cans are atmospheric containers: no inventory type or serial, only a volume.
 * Stored values stay 'Bottle' (shown as Cylinder) and 'Glass container' (shown as Glass bottle); records saved before
 * containerType existed are cylinders identified by bottleSerial, and older glass containers keep their own ID.
 */
export type ContainerType = 'Bottle' | 'Glass container' | 'IATA can';
export const containerTypes: ContainerType[] = ['Bottle', 'Glass container', 'IATA can'];
export const containerTypeName: Record<ContainerType, string> = { Bottle: 'Cylinder', 'Glass container': 'Glass bottle', 'IATA can': 'IATA can' };
/** Volumes offered for the atmospheric containers. */
export const containerVolumes: Record<'Glass container' | 'IATA can', string[]> = { 'Glass container': ['250 mL', '500 mL', '1 L'], 'IATA can': ['1 L', '5 L', '10 L'] };
export type ContainerFields = { containerType?: ContainerType; containerId?: string; containerVolume?: string; bottle?: string; bottleSerial?: string };

export const isGlass = (sample: ContainerFields) => sample.containerType === 'Glass container';
/** Glass bottle or IATA can: not part of the cylinder inventory and not pressurised. */
export const isAtmospheric = (sample: ContainerFields) => sample.containerType === 'Glass container' || sample.containerType === 'IATA can';
/** Cylinder serial, or the ID written on an older glass container. Glass bottles and IATA cans now carry no identifier. */
export function containerId(sample: ContainerFields): string {
  return ((isAtmospheric(sample) ? sample.containerId : sample.bottleSerial) || '').trim();
}
/** Cylinders need an inventory type and serial; glass bottles and IATA cans need only a volume (older glass containers: their ID). */
export function containerComplete(sample: ContainerFields): boolean {
  return isAtmospheric(sample) ? !!(sample.containerVolume || '').trim() || !!containerId(sample) : !!sample.bottle && !!containerId(sample);
}
export const containerNoun = (sample: ContainerFields) => containerTypeName[sample.containerType || 'Bottle'] || 'Cylinder';
/** Type with volume or identifier for display, e.g. "PDS · 1234", "Glass bottle · 500 mL" or "IATA can · 5 L". */
export function containerLabel(sample: ContainerFields, missing = 'Not recorded'): string {
  if (isAtmospheric(sample)) { const detail = [(sample.containerVolume || '').trim(), containerId(sample)].filter(Boolean).join(' · '); return detail ? containerNoun(sample) + ' · ' + detail : missing; }
  return [sample.bottle, sample.bottleSerial].filter(Boolean).join(' · ') || missing;
}
/** What is missing on an incomplete container, for messages. */
export const containerMissing = (sample: ContainerFields) => isAtmospheric(sample) ? containerNoun(sample) + ' volume is missing.' : 'Cylinder type and number are missing.';
