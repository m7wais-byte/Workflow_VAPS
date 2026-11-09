/**
 * A sample is held in a cylinder (from the cylinder inventory) or a glass container (its own ID).
 * The stored container type value stays 'Bottle' (shown as Cylinder); records saved before containerType existed are cylinders identified by bottleSerial.
 */
export type ContainerType = 'Bottle' | 'Glass container';
export const containerTypes: ContainerType[] = ['Bottle', 'Glass container'];
export type ContainerFields = { containerType?: ContainerType; containerId?: string; bottle?: string; bottleSerial?: string };

export const isGlass = (sample: ContainerFields) => sample.containerType === 'Glass container';
/** The identifier used for handover, reports and validation. */
export function containerId(sample: ContainerFields): string {
  return ((isGlass(sample) ? sample.containerId : sample.bottleSerial) || '').trim();
}
/** Bottles need an inventory type and serial; glass containers need only their own ID. */
export function containerComplete(sample: ContainerFields): boolean {
  return isGlass(sample) ? !!containerId(sample) : !!sample.bottle && !!containerId(sample);
}
export const containerNoun = (sample: ContainerFields) => isGlass(sample) ? 'Glass container' : 'Cylinder';
/** Type and identifier for display, e.g. "Type A · 1234" or "Glass container · G-07". */
export function containerLabel(sample: ContainerFields, missing = 'Not recorded'): string {
  if (isGlass(sample)) return containerId(sample) ? 'Glass container · ' + containerId(sample) : missing;
  return [sample.bottle, sample.bottleSerial].filter(Boolean).join(' · ') || missing;
}
