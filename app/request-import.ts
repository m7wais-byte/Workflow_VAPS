import { requestStatuses, type RequestRecord, type RequestStatus } from './request-book';

/**
 * Import of the laboratory's Excel request book and CSV export. The workbook is read in the browser only; nothing is
 * uploaded. An .xlsx file is a zip of XML parts, read here with the platform's own inflate so no library is needed.
 */
type Cell = string | number | null;

const decoder = new TextDecoder();
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
/** The named parts of a zip file as text. Parts that are not asked for are never inflated. */
async function zipParts(buffer: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw Error('This file is not an Excel workbook (.xlsx).');
  const parts = new Map<string, string>();
  let at = view.getUint32(end + 16, true);
  for (let i = view.getUint16(end + 10, true); i > 0 && view.getUint32(at, true) === 0x02014b50; i--) {
    const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true), nameLength = view.getUint16(at + 28, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)), local = view.getUint32(at + 42, true);
    if (wanted(name)) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true), data = bytes.subarray(start, start + size);
      if (method !== 0 && method !== 8) throw Error('This workbook uses a compression that cannot be read here.');
      parts.set(name, decoder.decode(method === 8 ? await inflate(data) : data));
    }
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return parts;
}
const unescapeXml = (text: string) => text.replace(/_x000D_/g, '').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, code: string) =>
  code[0] === '#' ? String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[code.toLowerCase()]);
const attribute = (tag: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1];
const textOf = (xml: string) => [...xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');
const columnIndex = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;

/** Cell values of one sheet (first matching name), by row and column. Formula cells give their last calculated value. */
export async function readXlsxSheet(buffer: ArrayBuffer, sheetNames: string[]): Promise<Cell[][]> {
  const meta = await zipParts(buffer, (name) => name === 'xl/workbook.xml' || name === 'xl/_rels/workbook.xml.rels' || name === 'xl/sharedStrings.xml');
  const workbook = meta.get('xl/workbook.xml'), rels = meta.get('xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw Error('This file is not an Excel workbook (.xlsx).');
  const sheets = [...workbook.matchAll(/<sheet\s[^>]*>/g)].map((m) => ({ name: unescapeXml(attribute(m[0], 'name') || ''), id: attribute(m[0], 'r:id') }));
  const sheet = sheetNames.map((name) => sheets.find((s) => s.name.trim().toLowerCase() === name.toLowerCase())).find(Boolean);
  if (!sheet) throw Error(`No sheet named ${sheetNames.map((n) => `“${n}”`).join(' or ')} was found in this workbook.`);
  const target = [...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((tag) => attribute(tag, 'Id') === sheet.id);
  const path = (attribute(target || '', 'Target') || '').replace(/^\/?(xl\/)?/, 'xl/');
  const xml = (await zipParts(buffer, (name) => name === path)).get(path);
  if (!xml) throw Error('The request sheet could not be read from this workbook.');
  const shared = [...(meta.get('xl/sharedStrings.xml') || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rows: Cell[][] = [];
  for (const row of xml.matchAll(/<row\s[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Cell[] = [];
    for (const cell of row[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attribute(cell[1], 'r'), type = attribute(cell[1], 't'), body = cell[2] || '';
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const value: Cell = type === 'inlineStr' ? textOf(body) : raw === undefined ? null : type === 's' ? shared[Number(raw)] ?? '' : type === 'str' || type === 'e' ? unescapeXml(raw) : Number(raw);
      if (ref) cells[columnIndex(ref)] = value;
    }
    rows.push(Array.from(cells, (value) => value ?? null));
  }
  return rows;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A request-book date as yyyy-mm-dd: an Excel serial number or day/month/year text. '' when it cannot be read safely. */
export function bookDate(value: Cell): string {
  if (typeof value === 'number') {
    if (!(value > 1 && value < 80000)) return '';
    const date = new Date(Math.round((value - 25569) * 86400000));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  const text = String(value ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const [y, m, d] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : dmy ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])] : [0, 0, 0];
  if (!y || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}

const columns = { no: 'request no', date: 'date', job: 'job no.', client: 'client', well: 'well name', sample: 'sample no.', cylinder: 'cylinder no.', experiment: 'experiment', liquid: 'liquid samples', gas: 'gas samples',
  balloon: 'balloon no.', h2s: 'h2s', doneBy: 'done by', ready: 'ready?', comments: 'comments', status: 'status', completed: 'date completed', delivered: 'date delivered' } as const;
export type ImportResult = { records: RequestRecord[]; notes: string[] };

/**
 * Request records from the rows of the "Request Log" sheet. Nothing is invented: a record with no Status uses the old
 * Ready? column (READY = Completed, NOT READY = In progress), and missing completed dates stay empty.
 */
export function recordsFromRows(rows: Cell[][], savedBy: string, today: string): ImportResult {
  const text = (value: Cell) => (typeof value === 'number' ? (Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)))) : String(value ?? '').trim());
  const headerAt = rows.findIndex((row) => text(row[0]).toLowerCase() === columns.no);
  if (headerAt < 0) throw Error('The sheet has no “Request No” header row, so it cannot be imported.');
  const header = rows[headerAt].map((cell) => text(cell).toLowerCase());
  const at = Object.fromEntries(Object.entries(columns).map(([key, label]) => [key, header.indexOf(label)])) as Record<keyof typeof columns, number>;
  const missing = (['date', 'job', 'well', 'experiment', 'doneBy'] as const).filter((key) => at[key] < 0);
  if (missing.length) throw Error('The sheet is missing these columns: ' + missing.map((key) => columns[key]).join(', ') + '.');
  const records: RequestRecord[] = [], seen = new Set<string>();
  let duplicates = 0, noDate = 0, noStatus = 0;
  for (const row of rows.slice(headerAt + 1)) {
    const cell = (key: keyof typeof columns) => (at[key] < 0 ? null : row[at[key]] ?? null);
    let no = text(cell('no'));
    if (!no) continue;
    // The old book repeats a few numbers. Both records are kept; the later one is marked so each stays unique.
    if (seen.has(no)) { duplicates++; let copy = 2; while (seen.has(`${no} (${copy})`)) copy++; no = `${no} (${copy})`; }
    seen.add(no);
    const date = bookDate(cell('date'));
    if (!date) noDate++;
    const stated = requestStatuses.find((s) => s.toLowerCase() === text(cell('status')).toLowerCase()), ready = text(cell('ready')).toUpperCase();
    const status: RequestStatus = stated || (ready === 'READY' ? 'Completed' : 'In progress');
    if (!stated && ready !== 'READY' && ready !== 'NOT READY') noStatus++;
    records.push({ no, date, job: text(cell('job')), client: text(cell('client')), well: text(cell('well')), sample: text(cell('sample')), cylinder: text(cell('cylinder')), experiment: text(cell('experiment')),
      liquid: Number(cell('liquid')) || 0, gas: Number(cell('gas')) || 0, balloon: text(cell('balloon')) || 'None', h2s: text(cell('h2s')).toUpperCase() === 'H2S', doneBy: text(cell('doneBy')), status,
      completed: bookDate(cell('completed')), delivered: bookDate(cell('delivered')), comments: text(cell('comments')), savedBy, savedAt: today });
  }
  const notes: string[] = [];
  if (duplicates) notes.push(`${duplicates} record(s) repeat a request number used earlier in the sheet; they were kept and marked “(2)”.`);
  if (noDate) notes.push(`${noDate} record(s) have a date that could not be read; they were imported without a date.`);
  if (noStatus) notes.push(`${noStatus} record(s) had neither Status nor Ready?; they were imported as In progress.`);
  return { records, notes };
}

/** CSV of the request book (opens in Excel). Dates are yyyy-mm-dd so they sort and re-import safely. */
export function requestsCsv(records: RequestRecord[]): string {
  const quote = (value: string | number) => { const text = String(value); return /[",\r\n]/.test(text) || /^[=+\-@]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text; };
  const head = ['Request No', 'Date', 'Job No.', 'Client', 'Well Name', 'Sample No.', 'Cylinder No.', 'Experiment', 'Liquid samples', 'Gas samples', 'Balloon No.', 'H2S', 'Done By', 'Ready?', 'Comments', 'Status', 'Date Completed', 'Date Delivered', 'Last saved by', 'Last saved on'];
  const lines = records.map((r) => [r.no, r.date, r.job, r.client, r.well, r.sample, r.cylinder, r.experiment, r.liquid, r.gas, r.balloon, r.h2s ? 'H2S' : 'Non_H2S', r.doneBy,
    r.status === 'Completed' || r.status === 'Delivered' ? 'READY' : 'NOT READY', r.comments, r.status, r.completed, r.delivered, r.savedBy, r.savedAt].map(quote).join(','));
  return '﻿' + [head.join(','), ...lines].join('\r\n');
}
