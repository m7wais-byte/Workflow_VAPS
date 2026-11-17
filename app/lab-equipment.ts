/**
 * PVT laboratory equipment the PVT Team Lead assigns to each test, with the colour used on the weekly plan
 * (the same colour code as the printed plan). Chemistry tests carry no equipment.
 */
export type LabEquipment = { id: string; name: string; /** Bar colour on the weekly plan. */color: string; /** Text colour readable on the bar. */text: string };

export const labEquipment: LabEquipment[] = [
  { id: 'bo-sys-7', name: 'BO Sys-7', color: '#2f7fd1', text: '#fff' },
  { id: 'bo-sys-16', name: 'BO Sys-16', color: '#f2d21b', text: '#1d2a30' },
  { id: 'san-gc', name: 'San-GC', color: '#8fbf4d', text: '#1d2a30' },
  { id: 'san-bo', name: 'San-BO', color: '#6a3fa0', text: '#fff' },
  { id: 'cylinder', name: 'Cylinder', color: '#e07b2a', text: '#fff' },
  { id: 'bo-vaps-1', name: 'BO Vaps-1', color: '#d93a3a', text: '#fff' },
  { id: 'bo-vaps-2', name: 'BO Vaps-2', color: '#2f7d43', text: '#fff' },
  { id: 'free-of-cell', name: 'Free of cell', color: '#6b7c86', text: '#fff' },
];
/** Bars of tests with no equipment chosen yet. */
export const noEquipment = { color: '#e3e9eb', text: '#33464f' };
export const equipmentOf = (id?: string) => labEquipment.find((e) => e.id === id);
export const equipmentName = (id?: string) => equipmentOf(id)?.name || 'Not assigned';
