/**
 * Cloud copy pilot (OneDrive here; SharePoint in the Microsoft 365 pilot): which folder each kind of job file goes to. One table for the browser and the
 * server; the server decides the folder from the purpose, never from a folder name sent by the browser.
 * Each job has exactly two folders: <Job ID>/Sampling and <Job ID>/Lab.
 */
export const filePurposes = {
  'scope-of-work': { section: 'sampling', label: 'Scope of work' },
  'sampling-sheet': { section: 'sampling', label: 'Sampling sheet (G-sheet)' },
  'sampling-report': { section: 'sampling', label: 'Sampling report' },
  'lab-workbook': { section: 'lab', label: 'Lab workbook' },
  'external-results': { section: 'lab', label: 'External lab results' },
  'final-report': { section: 'lab', label: 'Final report' },
} as const;
export type FilePurpose = keyof typeof filePurposes;
export type FileSection = (typeof filePurposes)[FilePurpose]['section'];
export const isFilePurpose = (v: unknown): v is FilePurpose => typeof v === 'string' && Object.prototype.hasOwnProperty.call(filePurposes, v);
export const sectionFolder: Record<FileSection, string> = { sampling: 'Sampling', lab: 'Lab' };
