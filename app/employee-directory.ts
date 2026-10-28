export type Employee = { id: string; name: string; role: string; password: string; initials: string; departmentId: string; positionId: string; employeeCode: string; email: string; phone: string; active: boolean };
export type DirectoryOption = { id: string; name: string; active: boolean };
export type Directory = { employees: Employee[]; departments: DirectoryOption[]; positions: DirectoryOption[] };
export const directoryKey = 'vaps-directory-v1';
export const seedPeople = [
 ['SALIM','Salim Al Maqbali','coordination'],['WILFRED','Wilfred Mendonca','coordination'],
 ['HUSSEINI','Ahmed Al Husseini','sampling'],['MOHSIN','Mohsin Al Dhuhli','sampling'],['ALI','Ali Al Hasani','transport'],['HUMAID','Humaid Al Habsi','transport'],
 ['SHEREIQI','Ahmed Al Shereiqi','analysis'],['BAHRI','Al Yaqdhan Al Bahri','analysis'],['AHAD','Ahad Al Aasmi','analysis'],['NASSER','Nasser Al Saqri','analysis'],['RANJITH','Ranjith','analysis'],['YAQEEN','Yaqeen Al Haddabi','analysis'],['MA001','Mohammed Al Awaisi','Software Developer']
];
export function initialDirectory(): Directory {
 const roles = [...new Set(seedPeople.map(p => p[2]))];
 const options = roles.map(name => ({id: name, name, active: true}));
 return { departments: options.map(o => ({...o})), positions: options.map(o => ({...o})), employees: seedPeople.map(([id,name,role]) => ({id,name,role,password:'1234',initials:name.split(' ').map(n=>n[0]).slice(0,2).join(''),departmentId:role,positionId:role,employeeCode:id,email:'',phone:'',active:true})) };
}
export function loadDirectory(): Directory {
 const raw = window.localStorage.getItem(directoryKey);
 if (!raw) return initialDirectory();
 const value = JSON.parse(raw) as Directory;
 if (!Array.isArray(value.employees) || !Array.isArray(value.departments) || !Array.isArray(value.positions) || !value.employees.some(e=>e.id==='MA001' && e.active)) throw Error('Employee directory could not be loaded. Saved data has been preserved.');
 const migrated = migrateDirectory(value);
 if (migrated !== value) window.localStorage.setItem(directoryKey, JSON.stringify(migrated));
 return migrated;
}
export function validateDirectory(next: Directory) {
 if (!next.employees.some(e=>e.id==='MA001' && e.active)) throw Error('The project administrator must remain active.');
 const ids = new Set<string>(), codes = new Set<string>(), emails = new Set<string>();
 for (const e of next.employees) {
  if (!e.name.trim() || !next.departments.some(o=>o.id===e.departmentId) || !next.positions.some(o=>o.id===e.positionId)) throw Error('Name, department and position are required.');
  if (ids.has(e.id)) throw Error('Duplicate internal employee ID.'); ids.add(e.id);
  const code=e.employeeCode.trim().toLowerCase(), email=e.email.trim().toLowerCase();
  if(code && codes.has(code)) throw Error('Employee ID is already in use.'); if(code) codes.add(code);
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Enter a valid email address.');
  if(email && emails.has(email)) throw Error('Email is already in use.'); if(email) emails.add(email);
 }
 for(const list of [next.departments,next.positions]) {
  if(new Set(list.map(o=>o.name.trim().toLowerCase())).size!==list.length || list.some(o=>!o.name.trim())) throw Error('Option names must be unique and cannot be empty.');
 }
}
const normalName = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');
/** Adds Humaid Al Habsi as a driver beside Ali once, never duplicating an existing record by ID or name. */
export function migrateDirectory(value: Directory): Directory {
 if (value.employees.some(e => e.id === 'HUMAID' || normalName(e.name) === normalName('Humaid Al Habsi'))) return value;
 const ali = value.employees.find(e => e.id === 'ALI');
 const departmentId = ali?.departmentId || 'transport', positionId = ali?.positionId || 'transport';
 if (!value.departments.some(o => o.id === departmentId) || !value.positions.some(o => o.id === positionId)) return value;
 const humaid: Employee = { id: 'HUMAID', name: 'Humaid Al Habsi', role: ali?.role || 'transport', password: '1234', initials: 'HA', departmentId, positionId, employeeCode: value.employees.some(e => e.employeeCode.trim().toLowerCase() === 'humaid') ? '' : 'HUMAID', email: '', phone: '', active: true };
 return { ...value, employees: [...value.employees, humaid] };
}
