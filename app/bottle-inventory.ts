import { cylinderTypes } from "./naming";

export const bottleTypes = cylinderTypes;
export type Bottle = { type: string; serial: string; capacity: string; specification: string };
export const bottleStorageKey = "vaps-custom-bottles-v1";

export function validateBottle(bottle: Bottle, inventory: Bottle[]) {
  if (!bottleTypes.some((type) => type === bottle.type)) return "Choose a cylinder type.";
  if (!bottle.serial.trim()) return "Enter the serial number.";
  if (inventory.some((item) => item.serial.trim().toLowerCase() === bottle.serial.trim().toLowerCase())) return "This serial number is already in the inventory.";
  if (!bottle.capacity.trim()) return "Enter the capacity, including its unit (for example, 700 cc).";
  return "";
}
