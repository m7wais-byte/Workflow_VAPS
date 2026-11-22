import { appStorage } from './app-storage';
/**
 * PVT laboratory equipment the PVT Team Lead assigns to each test, with the colour used on the weekly plan
 * (the same colour code as the printed plan). Chemistry tests carry no equipment.
 *
 * The list is maintained in Settings → Laboratory equipment and saved in this browser. Equipment is never deleted:
 * a deactivated item is no longer offered for new assignments but tests already using it keep its name and colour.
 */
export type LabEquipment = { id: string; name: string; /** Bar colour on the weekly plan (#rrggbb). */color: string; /** Off = kept for tests that use it, not offered for new assignments. */active: boolean };

export const equipmentKey = 'vaps-lab-equipment-v1';
export const defaultEquipment: LabEquipment[] = [
  { id: 'bo-sys-7', name: 'BO Sys-7', color: '#2f7fd1', active: true },
  { id: 'bo-sys-16', name: 'BO Sys-16', color: '#f2d21b', active: true },
  { id: 'san-gc', name: 'San-GC', color: '#8fbf4d', active: true },
  { id: 'san-bo', name: 'San-BO', color: '#6a3fa0', active: true },
  { id: 'cylinder', name: 'Cylinder', color: '#e07b2a', active: true },
  { id: 'bo-vaps-1', name: 'BO Vaps-1', color: '#d93a3a', active: true },
  { id: 'bo-vaps-2', name: 'BO Vaps-2', color: '#2f7d43', active: true },
  { id: 'free-of-cell', name: 'Free of cell', color: '#6b7c86', active: true },
];
/** Bars of tests with no equipment chosen yet. */
export const noEquipment = { color: '#e3e9eb', text: '#33464f' };

const hex = /^#[0-9a-f]{6}$/i;
/** Dark or white text, whichever reads better on the colour. */
export function textOn(color: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1d2a30' : '#fff';
}

/** Validates a saved list. Null (nothing saved) gives the built-in list. Throws on unreadable data. */
export function readEquipment(raw: string | null): LabEquipment[] {
  if (raw === null) return defaultEquipment;
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw Error('Invalid laboratory equipment settings');
  const seen = new Set<string>();
  return value.map((q: unknown) => {
    const x = q as Partial<LabEquipment>;
    if (!x || typeof x.id !== 'string' || !x.id || seen.has(x.id) || typeof x.name !== 'string' || !x.name.trim() || typeof x.color !== 'string' || !hex.test(x.color)) throw Error('Invalid laboratory equipment settings');
    seen.add(x.id);
    return { id: x.id, name: x.name.trim(), color: x.color.toLowerCase(), active: x.active !== false };
  });
}

let cache: { raw: string | null; list: LabEquipment[] } | undefined;
/** The saved list (active and inactive). Unreadable saved data falls back to the built-in list; Settings reports the problem. */
export function storedEquipment(): LabEquipment[] {
  const store = appStorage();
  if (!store) return defaultEquipment;
  const raw = store.getItem(equipmentKey);
  if (cache && cache.raw === raw) return cache.list;
  let list = defaultEquipment;
  try { list = readEquipment(raw); } catch { /* keep the built-in list */ }
  cache = { raw, list };
  return list;
}
/** Equipment offered for new assignments. */
export const activeEquipment = () => storedEquipment().filter((q) => q.active);
export const equipmentOf = (id?: string) => { const q = id ? storedEquipment().find((e) => e.id === id) : undefined; return q ? { ...q, text: textOn(q.color) } : undefined; };
export const equipmentName = (id?: string) => equipmentOf(id)?.name || 'Not assigned';

const clean = (name: string) => name.trim().replace(/\s+/g, ' ');
function checkName(list: LabEquipment[], name: string, selfId?: string) {
  const n = clean(name);
  if (!n) throw Error('Enter the equipment name.');
  if (n.length > 40) throw Error('Keep the equipment name to 40 characters or fewer.');
  if (list.some((q) => q.id !== selfId && q.name.toLowerCase() === n.toLowerCase())) throw Error(`“${n}” is already in the list.`);
  return n;
}
const checkColor = (color: string) => { if (!hex.test(color)) throw Error('Choose a colour.'); return color.toLowerCase(); };
/** New equipment at the end of the list. The id is permanent, so renaming later never breaks saved tests. */
export function addEquipment(list: LabEquipment[], name: string, color: string): LabEquipment[] {
  const n = checkName(list, name), c = checkColor(color);
  const base = n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'equipment';
  let id = base; for (let i = 2; list.some((q) => q.id === id); i++) id = `${base}-${i}`;
  return [...list, { id, name: n, color: c, active: true }];
}
export function updateEquipment(list: LabEquipment[], id: string, change: Partial<Pick<LabEquipment, 'name' | 'color' | 'active'>>): LabEquipment[] {
  return list.map((q) => q.id !== id ? q : { ...q,
    ...(change.name !== undefined ? { name: checkName(list, change.name, id) } : {}),
    ...(change.color !== undefined ? { color: checkColor(change.color) } : {}),
    ...(change.active !== undefined ? { active: change.active } : {}) });
}
