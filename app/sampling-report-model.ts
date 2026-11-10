/**
 * Sampling and Analysis Report: data mapping and pagination.
 * Pure functions only, so the in-app preview, the PDF export and the tests share one mapping.
 * Values are shown as recorded (units are never converted); missing values read "Not recorded".
 */
import { containerId, isGlass, type ContainerFields } from './sample-container';

export const NOT_RECORDED = 'Not recorded';

export type ReportSample = ContainerFields & { id: string; sampler?: string; samplerSerial?: string; depth?: string; notes?: string; fieldData?: Record<string, string> };
export type ReportEvent = { date?: string; time?: string; description?: string };
export type ReportPerson = { name: string; title?: string };
export type ReportCompany = { name: string; displayName: string; logo: string; address: string; country: string };
/**
 * Report details that live outside the job's sample evidence. Saved with each sampling report version
 * (on draft and submission, frozen at approval) so later edits to the job, client, company or employee
 * records cannot change an approved report.
 */
export type ReportLetterhead = {
  capturedAt: string;
  installation?: string; jobDate?: string; otherSamplingType?: string;
  client?: { name: string; shortName: string; logo?: string };
  company: ReportCompany;
  /** Name and job title by employee ID, as they were when captured. */
  people: Record<string, ReportPerson>;
};
export type SamplingReportInput = {
  jobNumber: string;
  /** Client as recorded on the job (short name, e.g. "PDO"). */
  clientName: string;
  /** Full client name from the client master (cover page). */
  clientFullName?: string;
  clientLogo?: string;
  company: ReportCompany;
  field?: string; well?: string; installation?: string; jobDate?: string;
  source?: string; otherSamplingType?: string;
  samples: ReportSample[];
  events: ReportEvent[];
  summary: string;
  version?: number;
  /** Workflow status of this report version, shown on draft copies. */
  status: string;
  /** True only when this version carries recorded approval evidence. */
  approved: boolean;
  preparedBy?: ReportPerson; preparedAt?: string;
  approvedBy?: ReportPerson; approvedAt?: string;
  /** Shown on the report when some details had to be taken from current records. */
  notice?: string;
};

export type Field = [label: string, value: string];
export type ListingRow = { sampleNo: string; date: string; time: string; nature: string; point: string; bottle: string };
export type EventRow = { date: string; time: string; event: string };
export type SampleSheet = {
  sampleId: string; title: string;
  identification: { left: Field[]; right: Field[] };
  shipping: { left: Field[]; right: Field[] };
  matched: { left: Field[]; right: Field[] };
  production: [Field[], Field[], Field[]];
  remarks: string[]; remarksContinue: boolean;
};
export type ReportPage =
  | { kind: 'cover'; number: number }
  | { kind: 'index'; number: number }
  | { kind: 'summary'; number: number; paragraphs: string[]; continued: boolean; last: boolean }
  | { kind: 'listing'; number: number; rows: ListingRow[]; continued: boolean }
  | { kind: 'events'; number: number; rows: EventRow[]; continued: boolean }
  | { kind: 'sheet'; number: number; sheet: SampleSheet }
  | { kind: 'remarks'; number: number; sampleId: string; title: string; lines: string[]; more: boolean };
export type IndexEntry = { no: number; title: string; pages: string };
export type SamplingReportModel = {
  input: SamplingReportInput;
  header: { client: string; jobNo: string; date: string; field: string; well: string; installation: string };
  cover: { clientTitle: string; well: string; test: string; date: string; prepared: { name: string; title: string; date: string }; approval: { name: string; title: string; date: string } | null };
  index: IndexEntry[];
  pages: ReportPage[];
  totalPages: number;
};

// ---------- value formatting ----------
const text = (v?: string) => (v ?? '').trim();
export const orNR = (v?: string) => text(v) || NOT_RECORDED;
/** Value with its recorded unit, e.g. "13835 kPa". N/A and free text stay as entered. */
export function withUnit(value?: string, unit?: string): string {
  const v = text(value), u = text(unit);
  if (!v) return NOT_RECORDED;
  return u && /\d/.test(v) && !v.toLowerCase().endsWith(u.toLowerCase()) ? `${v} ${u}` : v;
}
/** Pressure at temperature, as on the reference sheet: "27579 kPa @ 64.9 °C". */
export function pressureAt(f: Record<string, string>, p: string, t: string): string {
  const pv = withUnit(f[p], f[p + 'Unit']);
  const tv = text(f[t]);
  if (!tv || !/\d/.test(tv)) return pv;
  return `${pv} @ ${withUnit(f[t], f[t + 'Unit'])}`;
}
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function parts(value?: string): [number, number, number] | null {
  const v = text(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return [+m[1], +m[2], +m[3]];
  if (!/^\d{4}-\d{2}-\d{2}T/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}
/** "7-Nov-14" (cover and data sheets). Unparseable values are shown as recorded. */
export const dateShort = (v?: string) => { const p = parts(v); return p ? `${p[2]}-${months[p[1] - 1]}-${String(p[0]).slice(-2)}` : orNR(v); };
/** "7/11/2014" (page header). */
export const dateHeader = (v?: string) => { const p = parts(v); return p ? `${p[2]}/${p[1]}/${p[0]}` : orNR(v); };
/** "07/11/2014" (tables and approval block). */
export const dateTable = (v?: string) => { const p = parts(v); return p ? `${String(p[2]).padStart(2, '0')}/${String(p[1]).padStart(2, '0')}/${p[0]}` : orNR(v); };
/** Sort key for a recorded date and time; "8:00" sorts before "13:00". */
const sortKey = (date?: string, time?: string) => { const p = parts(date); const t = /^(\d{1,2}):(\d{2})/.exec(text(time)); return `${p ? p.map((n, i) => String(n).padStart(i ? 2 : 4, '0')).join('-') : '9999-99-99'}T${t ? t[1].padStart(2, '0') + ':' + t[2] : '99:99'}`; };

// ---------- sampling-type wording ----------
export const isOpenHole = (source?: string) => text(source).startsWith('Open Hole');
/** Data sheet heading. Only open-hole jobs are labelled Open Hole. */
export function sheetTitle(source?: string): string {
  const s = text(source);
  if (isOpenHole(s)) return 'Bottomhole Sample Data Sheet – Open Hole';
  if (s.startsWith('Cased Hole')) return 'Bottomhole Sample Data Sheet – Cased Hole';
  if (s === 'Wellhead Sampling') return 'Wellhead Sample Data Sheet';
  if (s === 'Separator Sampling') return 'Separator Sample Data Sheet';
  if (s === 'Station Sampling') return 'Station Sample Data Sheet';
  return 'Sample Data Sheet';
}
export const testLabel = (source?: string, other?: string) => text(source) === 'Other' && text(other) ? `Other – ${text(other)}` : orNR(source);
export const containerRef = (s: ContainerFields) => isGlass(s) ? (containerId(s) ? `Glass ${containerId(s)}` : NOT_RECORDED) : [text(s.bottle), text(s.bottleSerial)].filter(Boolean).join(' ') || NOT_RECORDED;

// ---------- text wrapping estimates (used only for page breaks) ----------
/** Greedy word wrap by character count, for page-break estimates; the last line of each recorded paragraph ends with "\n". */
export function wrap(value: string, perLine: number): string[] {
  const out: string[] = [];
  for (const para of value.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (word.length > perLine) { if (line) { out.push(line); line = ''; } out.push(word.slice(0, perLine)); word = word.slice(perLine); }
      if (!line) line = word; else if (line.length + 1 + word.length <= perLine) line += ' ' + word; else { out.push(line); line = word; }
    }
    out.push(line + '\n');
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}
/** Rejoins wrapped lines so the browser re-wraps them to the full width; recorded line breaks are kept. */
export const unwrap = (wrapped: string[]) => wrapped.map(l => l.endsWith('\n') ? l : l + ' ').join('').replace(/\n$/, '');
const lines = (value: string, perLine: number) => Math.max(1, wrap(value, perLine).length);

// Layout budget in millimetres; the stylesheet in sampling-report.tsx uses the same measures.
export const LAYOUT = {
  body: 214,
  summary: { title: 12, bar: 26, line: 4.6, gap: 4, chars: 84 },
  listing: { title: 15, well: 9, head: 10, line: 3.7, pad: 2.6, min: 8.4, chars: 14 },
  events: { title: 15, well: 7, head: 9, line: 3.7, pad: 5, min: 9, chars: 56, dateChars: 15 },
  sheet: { fixed: 182, row: 6.6, extraLine: 3.6, remarkLine: 4, remarkChars: 96 },
  remarks: { title: 22, line: 4, chars: 96 },
};

function chunk<T>(items: T[], height: (item: T) => number, budget: number): T[][] {
  const pages: T[][] = [[]]; let used = 0;
  for (const item of items) {
    const h = height(item);
    if (used + h > budget && pages[pages.length - 1].length) { pages.push([]); used = 0; }
    pages[pages.length - 1].push(item); used += h;
  }
  return pages;
}

function sheetFor(sample: ReportSample, title: string): Omit<SampleSheet, 'remarks' | 'remarksContinue'> {
  const f = sample.fieldData || {};
  const glass = isGlass(sample);
  const sampler = text(sample.sampler) ? [text(sample.sampler), text(sample.samplerSerial)].filter(Boolean).join(' ') : '';
  return {
    sampleId: sample.id, title,
    identification: {
      left: [['Sample No:', orNR(sample.id)], [glass ? 'Container No:' : 'Cylinder No:', containerRef(sample)], ['Sampling Date:', dateShort(f.samplingDate)], ['Sampling Time:', orNR(f.samplingTime)], ['Sampling Point:', withUnit(sample.depth, f.depthUnit)], ['Perforations:', withUnit(f.perforations, f.perforationsUnit)]],
      right: [['Sample Nature:', orNR(f.sampleNature)], ['Flow Period:', withUnit(f.flowPeriod, f.flowPeriodUnit)], ['Formation:', orNR(f.formation)], ...(sampler ? [['Sampler:', sampler] as Field] : [])],
    },
    shipping: {
      left: [[glass ? 'Container Type:' : 'Sample Cylinder Type:', glass ? 'Glass container' : orNR(sample.bottle)], [glass ? 'Container Volume:' : 'Sample Cylinder Volume:', withUnit(f.sampleBottleVolume, f.sampleBottleVolumeUnit)], ['Sample Volume:', withUnit(f.sampleVolume, f.sampleVolumeUnit)]],
      right: [['Gas Cap Created:', orNR(f.gasCapCreated)], ['Fluid Remaining:', withUnit(f.fluidRemaining, f.fluidRemainingUnit)], ['Final Pressure:', pressureAt(f, 'finalPressure', 'finalTemperature')]],
    },
    matched: {
      left: [['Opening Pressure:', pressureAt(f, 'initialOpeningPressure', 'initialOpeningTemperature')], ['Transfer Pressure:', pressureAt(f, 'transferPressure', 'transferTemperature')]],
      right: [['Opening Pressure:', pressureAt(f, 'receivingBottleOpeningPressure', 'receivingBottleOpeningTemperature')], ['Transfer Duration:', withUnit(f.transferDuration, f.transferDurationUnit)]],
    },
    production: [
      [['BHP:', withUnit(f.bhp, f.bhpUnit)], ['BHT:', withUnit(f.bht, f.bhtUnit)], ['At Depth:', NOT_RECORDED], ['WHP:', withUnit(f.whp, f.whpUnit)], ['WHT:', withUnit(f.wht, f.whtUnit)], ['Choke Size:', withUnit(f.chokeSize, f.chokeSizeUnit)], ['Stable Since:', orNR(f.stableSince)], ['H2S:', withUnit(f.h2s, f.h2sUnit)], ['CO2:', withUnit(f.co2, f.co2Unit)]],
      [['Sep Press:', withUnit(f.separatorPressure, f.separatorPressureUnit)], ['Sep Temp:', withUnit(f.separatorTemperature, f.separatorTemperatureUnit)], ['Gas Rate (std):', withUnit(f.gasRate, f.gasRateUnit)], ['Gas Gravity:', withUnit(f.gasGravity, f.gasGravityUnit && f.gasGravityUnit !== 'air = 1' ? f.gasGravityUnit : '')], ['Gas diff press:', withUnit(f.gasDifferentialPressure, f.gasDifferentialPressureUnit)], ['Gas Press:', withUnit(f.gasPressure, f.gasPressureUnit)], ['Gas Temp:', withUnit(f.gasTemperature, f.gasTemperatureUnit)], ['Fb factor:', orNR(f.fbFactor)], ['Fpv factor:', orNR(f.fpvFactor)]],
      // The data sheet records one "Oil Rate" without its condition basis, so it keeps its own label and the
      // std/sep-condition rows stay "Not recorded". Likewise BSW is recorded without a sampling point.
      [['Oil Rate (std cond):', NOT_RECORDED], ['Corrected by:', orNR(f.correctedBy)], ['Oil rate (sep cond):', NOT_RECORDED], ['Oil Rate:', withUnit(f.oilRate, f.oilRateUnit)], [!f.condensateGravityUnit || f.condensateGravityUnit === 'SG 60/60 °F' ? 'Oil gravity 60/60:' : 'Oil gravity:', withUnit(f.condensateGravity, f.condensateGravityUnit === 'SG 60/60 °F' ? '' : f.condensateGravityUnit)], ['Oil line temp:', withUnit(f.oilLineTemperature, f.oilLineTemperatureUnit)], ['Water rate:', withUnit(f.waterRate, f.waterRateUnit)], ['GOR:', withUnit(f.gor, f.gorUnit)], ['CGR:', withUnit(f.cgr, f.cgrUnit)], ['WOR:', withUnit(f.wor, f.worUnit)], ['BSW:', withUnit(f.bsw, f.bswUnit)]],
    ],
  };
}
/** Extra height (mm) taken by values that wrap inside their column. */
function sheetOverflow(s: Omit<SampleSheet, 'remarks' | 'remarksContinue'>): number {
  const { row, extraLine } = LAYOUT.sheet;
  const pairs = (a: Field[], b: Field[], ca: number, cb: number) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => Math.max(a[i] ? lines(a[i][1], ca) : 1, b[i] ? lines(b[i][1], cb) : 1));
  const extra = [...pairs(s.identification.left, s.identification.right, 34, 26), ...pairs(s.shipping.left, s.shipping.right, 28, 26), ...pairs(s.matched.left, s.matched.right, 28, 22),
    ...Array.from({ length: Math.max(...s.production.map((c) => c.length)) }, (_, i) => Math.max(...s.production.map((c, k) => c[i] ? lines(c[i][1], [12, 13, 12][k]) : 1)))].reduce((sum, n) => sum + (n - 1) * extraLine, 0);
  // Rows beyond the nine the fixed layout allows for in Production Conditions.
  const extraProduction = Math.max(0, Math.max(...s.production.map((c) => c.length)) - 9) * row;
  const rightOnly = Math.max(0, s.identification.right.length - s.identification.left.length) * row;
  return extra + rightOnly + extraProduction;
}

export function buildSamplingReport(input: SamplingReportInput): SamplingReportModel {
  const samples = input.samples || [];
  const firstSampling = samples.map(s => s.fieldData?.samplingDate || '').filter(d => parts(d)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))[0];
  const reportDate = firstSampling || input.jobDate || '';
  const header = { client: orNR(input.clientName), jobNo: orNR(input.jobNumber), date: dateHeader(reportDate), field: orNR(input.field), well: orNR(input.well), installation: orNR(input.installation) };
  const pages: ReportPage[] = [];
  const next = () => pages.length + 1;
  pages.push({ kind: 'cover', number: 1 });
  pages.push({ kind: 'index', number: 2 });

  // Summary
  const S = LAYOUT.summary;
  const paras = text(input.summary).split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean);
  const summaryChunks = chunk(paras.length ? paras : [NOT_RECORDED], p => lines(p, S.chars) * S.line + S.gap, LAYOUT.body - S.title - S.bar);
  const summaryStart = next();
  summaryChunks.forEach((c, i) => pages.push({ kind: 'summary', number: next(), paragraphs: c, continued: i > 0, last: i === summaryChunks.length - 1 }));

  // Sample listing
  const L = LAYOUT.listing;
  const listing: ListingRow[] = samples.map(s => ({ sampleNo: orNR(s.id), date: dateTable(s.fieldData?.samplingDate), time: orNR(s.fieldData?.samplingTime), nature: orNR(s.fieldData?.sampleNature), point: orNR(s.depth), bottle: containerRef(s) }));
  const listingStart = next();
  chunk(listing, r => Math.max(L.min, Math.max(...Object.values(r).map(v => lines(v, L.chars))) * L.line + L.pad), LAYOUT.body - L.title - L.well - L.head)
    .forEach((rows, i) => pages.push({ kind: 'listing', number: next(), rows, continued: i > 0 }));

  // Sequence of events: recorded field events only, in date/time order.
  const E = LAYOUT.events;
  const events: EventRow[] = (input.events || []).filter(e => text(e.description)).map((e, i) => ({ e, i }))
    .sort((a, b) => sortKey(a.e.date, a.e.time).localeCompare(sortKey(b.e.date, b.e.time)) || a.i - b.i)
    .map(({ e }) => ({ date: text(e.date) ? dateTable(e.date) : '', time: text(e.time), event: text(e.description) }));
  const eventsStart = next();
  chunk(events, r => Math.max(E.min, Math.max(lines(r.event, E.chars), lines(r.date, E.dateChars)) * E.line + E.pad), LAYOUT.body - E.title - E.well - E.head)
    .forEach((rows, i) => pages.push({ kind: 'events', number: next(), rows, continued: i > 0 }));

  // One data sheet per sample; long remarks continue on following pages.
  const title = sheetTitle(input.source);
  const sheetsStart = next();
  const SH = LAYOUT.sheet, R = LAYOUT.remarks;
  for (const sample of samples) {
    const base = sheetFor(sample, title);
    const remarkLines = wrap(text(sample.notes) || NOT_RECORDED, SH.remarkChars);
    const fit = Math.max(1, Math.floor((LAYOUT.body - SH.fixed - sheetOverflow(base)) / SH.remarkLine));
    // Leave room for the "continues on the next page" note when the remarks do not fit.
    const take = remarkLines.length > fit ? Math.max(1, fit - 2) : fit;
    const first = remarkLines.slice(0, take), rest = remarkLines.slice(take);
    pages.push({ kind: 'sheet', number: next(), sheet: { ...base, remarks: first, remarksContinue: rest.length > 0 } });
    const per = Math.floor((LAYOUT.body - R.title - 8) / R.line);
    for (let i = 0; i < rest.length; i += per) pages.push({ kind: 'remarks', number: next(), sampleId: sample.id, title, lines: rest.slice(i, i + per), more: i + per < rest.length });
  }
  const last = pages.length;
  const range = (a: number, b: number) => a >= b ? String(a) : `${a}–${b}`;
  const index: IndexEntry[] = [
    { no: 1, title: 'Summary', pages: range(summaryStart, listingStart - 1) },
    { no: 2, title: 'Sample Listing', pages: range(listingStart, eventsStart - 1) },
    { no: 3, title: 'Sequence Of Events', pages: range(eventsStart, sheetsStart - 1) },
    { no: 4, title: 'Sample Data Sheet', pages: samples.length ? range(sheetsStart, last) : '–' },
  ];
  const approval = input.approved && input.approvedBy ? { name: input.approvedBy.name, title: input.approvedBy.title || '', date: dateTable(input.approvedAt) } : null;
  return {
    input, header, index, pages, totalPages: last,
    cover: {
      clientTitle: text(input.clientFullName) || orNR(input.clientName), well: orNR(input.well), test: testLabel(input.source, input.otherSamplingType), date: dateShort(reportDate),
      prepared: { name: input.preparedBy?.name || NOT_RECORDED, title: input.preparedBy?.title || '', date: input.preparedAt ? dateTable(input.preparedAt) : '' },
      approval,
    },
  };
}
