'use client';
/* eslint-disable @next/next/no-img-element -- logos must stay plain <img> so the print/PDF copy carries them. */
import { assetUrl, basePath } from './deployment';
import type { ReactNode } from 'react';
import { buildSamplingReport, unwrap, NOT_RECORDED, type Field, type ReportCompany, type ReportEvent, type ReportLetterhead, type ReportPerson, type ReportSample, type SamplingReportInput, type SamplingReportModel, type SampleSheet } from './sampling-report-model';
import { clientLogoSource } from './client-logo';

/** Live records the report needs besides the saved job: company letterhead, client master and job titles. */
export type ReportContext = { company: ReportCompany; clients: { code: string; name: string; shortName: string; logo?: string }[]; positionName: (employeeId?: string) => string; employeeName: (employeeId?: string) => string };
type ReportJob = { jobNumber: string; clientCode?: string; clientName: string; fieldArea?: string; well?: string; rigInstallation?: string; dateReceived?: string; samplingSource?: string; otherSamplingType?: string };
type ReportSnapshot = Partial<{ samples: ReportSample[]; events: ReportEvent[]; source: string; jobNumber: string; clientName: string; well: string; fieldArea: string }>;
const findClient = (job: ReportJob, ctx: ReportContext, clientName?: string) => ctx.clients.find(c => c.code === job.clientCode) || ctx.clients.find(c => [c.shortName, c.name].includes(clientName || job.clientName));

/**
 * Captures the report details that are not part of the sample evidence (installation, job date, client name and logo,
 * company details, and the names and job titles of the given employees) for saving with a report version.
 */
export function captureLetterhead(job: ReportJob, ctx: ReportContext, employeeIds: (string | undefined)[], at: string): ReportLetterhead {
  const client = findClient(job, ctx);
  const people: Record<string, ReportPerson> = {};
  for (const id of employeeIds) if (id) people[id] = { name: ctx.employeeName(id), title: ctx.positionName(id) };
  return { capturedAt: at, installation: job.rigInstallation || '', jobDate: job.dateReceived || '', otherSamplingType: job.otherSamplingType || '',
    client: client ? { name: client.name, shortName: client.shortName, logo: clientLogoSource(client) || undefined } : undefined,
    company: { ...ctx.company }, people };
}
export const letterheadNotice = 'This version was saved before report details were recorded with each version. Installation, job date, client name and logo, company details, and names and job titles are shown from current records and may differ from the copy originally approved.';

/**
 * Report input for one version. Samples, events and job identity come from the version's saved snapshot; installation,
 * job date, client branding, company details and people come from the version's saved letterhead. Only versions saved
 * without a letterhead fall back to current records, and approved ones then carry a notice saying so.
 */
export function samplingReportInput(job: ReportJob, ctx: ReportContext, version: { snapshot: ReportSnapshot; letterhead?: ReportLetterhead; summary: string; version?: number; status: string; approved: boolean; preparedBy?: string; preparedAt?: string; approvedBy?: string; approvedAt?: string }): SamplingReportInput {
  const snap = version.snapshot, saved = version.letterhead;
  const live = saved ? undefined : findClient(job, ctx, snap.clientName);
  const client = saved ? saved.client : live ? { name: live.name, shortName: live.shortName, logo: clientLogoSource(live) || undefined } : undefined;
  let fromCurrent = !saved;
  const person = (id?: string) => { if (!id) return undefined; const p = saved?.people[id]; if (p) return p; fromCurrent = true; return { name: ctx.employeeName(id), title: ctx.positionName(id) }; };
  const preparedBy = person(version.preparedBy), approvedBy = version.approved ? person(version.approvedBy) : undefined;
  return {
    jobNumber: snap.jobNumber || job.jobNumber, clientName: snap.clientName || job.clientName, clientFullName: client?.name, clientLogo: client?.logo,
    company: saved ? saved.company : ctx.company, field: snap.fieldArea ?? job.fieldArea, well: snap.well ?? job.well,
    installation: saved ? saved.installation : job.rigInstallation, jobDate: saved ? saved.jobDate : job.dateReceived,
    source: snap.source ?? job.samplingSource, otherSamplingType: saved ? saved.otherSamplingType : job.otherSamplingType, samples: snap.samples || [], events: snap.events || [],
    summary: version.summary, version: version.version, status: version.status, approved: version.approved,
    preparedBy, preparedAt: version.preparedAt, approvedBy, approvedAt: version.approved ? version.approvedAt : undefined,
    notice: version.approved && fromCurrent ? letterheadNotice : undefined,
  };
}

/**
 * A4 stylesheet for the Sampling and Analysis Report. It travels inside the document markup,
 * so the in-app preview and the exported PDF use exactly the same template.
 * Vertical measures match LAYOUT in sampling-report-model.ts.
 */
export const samplingReportCss = `
@page{size:A4 portrait;margin:0}
.sr-doc{--sr-blue:#1f6fb5;--sr-navy:#0d3b6e;--sr-green:#0a9a3c;--sr-ink:#1b2733;--sr-muted:#5d6f82;--sr-line:#cfdae6;--sr-tint:#f2f6fa;font-family:Arial,"Liberation Sans",Helvetica,sans-serif;color:var(--sr-ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sr-doc *{box-sizing:border-box}
.sr-doc .sr-page :is(h1,h2,p,span,b,strong,small,em,table,th,td,div,section,header,footer){font-family:inherit;color:inherit;letter-spacing:normal;text-transform:none;text-shadow:none}
.sr-doc :where(h1,h2,p){margin:0;max-width:none}
.sr-page{position:relative;width:210mm;height:297mm;padding:16mm 20mm 0 20mm;background:#fff;overflow:hidden;margin:0 auto 8mm;box-shadow:0 1px 6px rgba(15,23,42,.25)}
/* Page frame: top accent, header, footer and wave are the same on every page */
.sr-top{position:absolute;left:0;top:0;width:210mm;height:2.6mm;background:var(--sr-blue)}
.sr-top::after{content:"";position:absolute;right:0;top:0;width:52mm;height:2.6mm;background:var(--sr-green)}
.sr-wave{position:absolute;left:0;bottom:0;width:210mm;height:17mm;display:block}
.sr-doc .sr-page .sr-head{position:relative;display:grid;grid-template-columns:31mm 1fr auto;align-items:center;column-gap:4mm;height:20mm;border-bottom:1.2pt solid var(--sr-blue);padding-bottom:2mm}
.sr-head::after{content:"";position:absolute;right:0;bottom:-1.2pt;width:34mm;height:1.2pt;background:var(--sr-green)}
.sr-head .sr-head-logo{display:flex;align-items:center;height:16mm;border-right:0.8pt solid var(--sr-line);padding-right:3mm}
.sr-head .sr-head-logo img{max-height:15mm;max-width:27mm}
.sr-doc .sr-page .sr-head-logo strong{font-size:13pt;color:var(--sr-navy)}
.sr-hc{display:grid;grid-template-columns:1fr 1fr 1.25fr;grid-template-rows:8mm 8mm;column-gap:3mm;min-width:0}
.sr-hc div{display:flex;flex-direction:column;justify-content:center;min-width:0}
.sr-doc .sr-page .sr-hc b{font-size:5.6pt;font-weight:700;letter-spacing:.25mm;text-transform:uppercase;color:var(--sr-muted);line-height:2.6mm}
.sr-doc .sr-page .sr-hc span{font-size:8pt;font-weight:700;color:var(--sr-navy);line-height:3.8mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sr-head-client{display:flex;align-items:center;justify-content:flex-end;height:16mm}
.sr-head-client img{max-height:13mm;max-width:22mm}
.sr-body{height:214mm;margin-top:3mm;overflow:hidden}
.sr-doc .sr-page .sr-foot{position:absolute;left:20mm;right:20mm;bottom:19mm;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);column-gap:3mm;align-items:center;border-top:0.6pt solid var(--sr-line);padding-top:1.6mm;font-size:7pt;color:var(--sr-muted)}
.sr-doc .sr-page .sr-foot b{font-size:7.5pt;font-weight:700;letter-spacing:.2mm;color:var(--sr-navy)}
.sr-foot span:last-child{text-align:right}
.sr-doc .sr-page .sr-tagline{position:absolute;left:20mm;bottom:6.2mm;font-size:5.8pt;font-style:italic;letter-spacing:.5mm;text-transform:uppercase;color:var(--sr-blue)}
.sr-doc .sr-page .sr-web{position:absolute;right:12mm;bottom:3mm;font-size:7.5pt;font-weight:700;letter-spacing:.2mm;color:#fff}
.sr-draft{position:absolute;left:0;right:0;top:44%;text-align:center;transform:rotate(-30deg);font-size:40pt;font-weight:700;letter-spacing:2mm;color:rgba(190,30,30,.10);pointer-events:none;white-space:nowrap}
.sr-doc .sr-page .sr-h1{font-size:16pt;font-weight:700;margin:0;height:12mm;display:flex;align-items:center;color:var(--sr-navy)}
.sr-doc .sr-page .sr-h2{font-size:12pt;font-weight:700;margin:0;height:9mm;display:flex;align-items:center;color:var(--sr-navy)}
.sr-h1::before,.sr-h2::before,.sr-sheet-title::before{content:"";flex:none;width:1.4mm;height:6.5mm;margin-right:3mm;border-radius:.7mm;background:var(--sr-green)}
/* Cover */
.sr-cover{padding-top:20mm}
.sr-banner{display:grid;grid-template-columns:1fr 1fr;align-items:center;column-gap:10mm;height:34mm;border-bottom:1.2pt solid var(--sr-blue);padding-bottom:6mm;position:relative}
.sr-banner::after{content:"";position:absolute;right:0;bottom:-1.2pt;width:48mm;height:1.2pt;background:var(--sr-green)}
.sr-brand{display:flex;align-items:center;gap:5mm;min-width:0}
.sr-brand-client{justify-content:flex-end}
.sr-brand img{max-height:22mm;max-width:34mm;flex:none}
.sr-doc .sr-page .sr-brand strong{display:block;border-left:1pt solid var(--sr-green);padding:1.5mm 0 1.5mm 5mm;font-size:11pt;font-weight:700;color:var(--sr-navy);line-height:1.3;max-width:47mm;overflow-wrap:anywhere}
.sr-cover-title{margin:34mm 0 0;padding-left:6mm;border-left:2mm solid var(--sr-green)}
.sr-doc .sr-page .sr-cover-title h1{font-size:30pt;line-height:1.12;font-weight:700;color:var(--sr-navy);margin:0}
.sr-cover-facts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3mm;margin:14mm 0 0}
.sr-cover-facts div{background:var(--sr-tint);border-top:1.2pt solid var(--sr-blue);border-radius:0 0 1.5mm 1.5mm;padding:2.6mm 3.5mm;min-height:15mm;min-width:0}
.sr-cover-facts .wide{grid-column:span 2}
.sr-doc .sr-page .sr-cover-facts dt{font-size:6pt;font-weight:700;letter-spacing:.4mm;text-transform:uppercase;color:var(--sr-muted);margin-bottom:1.4mm}
.sr-doc .sr-page .sr-cover-facts dd{margin:0;font-size:10pt;font-weight:700;color:var(--sr-navy);line-height:1.25;overflow-wrap:anywhere}
.sr-approval{position:absolute;left:20mm;right:20mm;top:196mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.sr-approval>div{border:0.6pt solid var(--sr-line);border-left:1.4mm solid var(--sr-blue);border-radius:1.5mm;padding:3mm 4mm;min-height:24mm;display:grid;grid-template-columns:1fr auto;column-gap:3mm;align-content:start}
.sr-approval>div+div{border-left-color:var(--sr-green)}
.sr-doc .sr-page .sr-approval small{grid-column:1/-1;font-size:6pt;font-weight:700;letter-spacing:.4mm;text-transform:uppercase;color:var(--sr-muted);margin-bottom:1.6mm}
.sr-doc .sr-page .sr-approval strong{font-size:10pt;color:var(--sr-navy);line-height:1.25;overflow-wrap:anywhere}
.sr-doc .sr-page .sr-approval i{font-style:normal;font-size:8pt;color:var(--sr-ink);text-align:right;white-space:nowrap}
.sr-doc .sr-page .sr-approval span{grid-column:1/-1;font-size:8pt;color:var(--sr-muted);margin-top:.8mm;overflow-wrap:anywhere}
.sr-doc .sr-page .sr-approval em{font-size:9pt;color:var(--sr-muted);font-style:italic}
.sr-notice{position:absolute;left:20mm;right:20mm;top:225mm;font-size:7pt;line-height:1.35;color:var(--sr-muted);font-style:italic}
/* Index */
.sr-index{margin:14mm 0 0}
.sr-index>div{display:grid;grid-template-columns:9mm 1fr 24mm;align-items:center;column-gap:5mm;height:13mm;border-bottom:0.6pt solid var(--sr-line)}
.sr-doc .sr-page .sr-index b{width:8mm;height:8mm;border-radius:1.5mm;background:var(--sr-blue);color:#fff;font-size:10pt;font-weight:700;display:flex;align-items:center;justify-content:center}
.sr-index>div:nth-child(even) b{background:var(--sr-green)}
.sr-doc .sr-page .sr-index span{font-size:11pt;font-weight:700;color:var(--sr-navy)}
.sr-doc .sr-page .sr-index i{font-style:normal;text-align:right;font-size:9pt;color:var(--sr-muted)}
/* Summary */
.sr-summary{padding:2mm 4mm 0 4.4mm;font-size:9.5pt;line-height:4.6mm}
.sr-summary p{margin:0 0 4mm}
.sr-bar{margin:12mm 4mm 0 4.4mm;height:9mm;display:flex;align-items:center;gap:2mm}
.sr-bar::before{content:"";width:26mm;height:1.2pt;background:var(--sr-blue)}
.sr-bar::after{content:"";width:10mm;height:1.2pt;background:var(--sr-green)}
/* Tables */
.sr-doc .sr-page .sr-well{font-size:7.5pt;font-weight:700;letter-spacing:.2mm;color:var(--sr-muted);height:9mm;display:flex;align-items:center;gap:3mm}
.sr-doc .sr-page .sr-well span{font-weight:700;color:var(--sr-navy)}
.sr-events-well{height:7mm;align-items:flex-start}
.sr-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5pt}
.sr-table th,.sr-table td{border:0.6pt solid var(--sr-line);padding:1.3mm 1.2mm;text-align:center;vertical-align:middle;line-height:3.7mm;overflow-wrap:anywhere}
.sr-table tr{break-inside:avoid}
.sr-doc .sr-page .sr-table thead th{height:10mm;font-weight:700;font-size:8pt;color:#fff;background:var(--sr-navy);border-color:var(--sr-navy);border-bottom:1.4pt solid var(--sr-green)}
.sr-table td{height:8.4mm;font-weight:400}
.sr-doc .sr-page .sr-table td:first-child{font-weight:700;color:var(--sr-navy)}
.sr-table tbody tr:nth-child(even) td{background:var(--sr-tint)}
.sr-doc .sr-page .sr-events thead th{height:9mm}
.sr-events td{height:9mm;padding:2.5mm 1.2mm}
.sr-events td:nth-child(2){font-weight:700}
.sr-events th:last-child,.sr-events td:last-child{text-align:left;padding-left:3mm}
.sr-empty{font-size:8.5pt;font-style:italic;color:var(--sr-muted);padding:3mm 0}
/* Sample data sheet */
.sr-doc .sr-page .sr-sheet-title{font-size:15pt;font-weight:700;margin:0;height:15mm;display:flex;align-items:center;color:var(--sr-navy)}
.sr-doc .sr-page .sr-sec{height:5.4mm;margin:.8mm 0 .8mm;padding:0 2.4mm;font-size:8pt;font-weight:700;letter-spacing:.25mm;text-transform:uppercase;color:#fff;border-radius:.8mm;display:flex;align-items:center}
.sr-sec.b{background:var(--sr-blue)}.sr-sec.g{background:var(--sr-green)}
.sr-pairs{display:grid;grid-template-columns:1fr 1fr;column-gap:4mm;font-size:7.6pt;padding:0 1mm}
.sr-col{display:flex;flex-direction:column}
.sr-row{display:grid;min-height:6.6mm;align-items:center;column-gap:2mm;border-bottom:0.4pt solid #e6ecf2}
.sr-col .sr-row:last-child{border-bottom:0}
.sr-doc .sr-page .sr-row b{font-weight:700;color:#3d5268}
.sr-row span{overflow-wrap:anywhere;line-height:3.4mm}
.sr-ident .sr-row{grid-template-columns:26mm 1fr}
.sr-ship .sr-row{grid-template-columns:34mm 1fr}
.sr-ship .sr-col+.sr-col .sr-row,.sr-ident .sr-col+.sr-col .sr-row{grid-template-columns:27mm 1fr}
.sr-matched .sr-row{grid-template-columns:34mm 1fr}
.sr-matched .sr-col+.sr-col{padding-left:8mm}
.sr-matched .sr-col+.sr-col .sr-row{grid-template-columns:27mm 1fr}
.sr-prod{display:grid;grid-template-columns:44mm 54mm 1fr;column-gap:3mm;font-size:7.6pt;padding:0 1mm}
.sr-prod .sr-col:nth-child(1) .sr-row{grid-template-columns:19mm 1fr}
.sr-prod .sr-col:nth-child(2) .sr-row{grid-template-columns:27mm 1fr}
.sr-prod .sr-col:nth-child(3) .sr-row{grid-template-columns:31mm 1fr}
.sr-doc .sr-page .sr-nr{color:#8493a3;font-style:italic;font-weight:400}
.sr-remarks{font-size:8pt;line-height:4mm;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:0 1mm}
.sr-more{font-size:7pt;color:var(--sr-muted);font-style:italic;margin-top:1mm}
@media print{
 html,body{margin:0;padding:0;background:#fff}
 .sr-page{margin:0;box-shadow:none;break-after:page;page-break-after:always}
 .sr-page:last-child{break-after:auto;page-break-after:auto}
}
`;

/** Company tagline, as used on the VAPS letterhead and e-mail signature. */
const TAGLINE = 'Excellence in solutions.';
/** Blue and green sweep along the bottom of every page (an image, so the preview, print and PDF copy match). */
const WAVE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2100" height="170" viewBox="0 0 210 17" preserveAspectRatio="none"><path d="M0 15.2C70 16.6 140 12.4 210 1.6V0C140 10.6 70 15.4 0 14.2Z" fill="#0a9a3c"/><path d="M0 17V15.2C70 16.6 140 12.4 210 1.6V17Z" fill="#1f6fb5"/><path d="M96 17C140 15.6 180 11.4 210 6.4V17Z" fill="#0d3b6e"/></svg>');
const website = (m: SamplingReportModel) => (m.input.company.website || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');

const Value = ({ v }: { v: string }) => v === NOT_RECORDED ? <span className="sr-nr">{v}</span> : <span>{v}</span>;
const Rows = ({ fields }: { fields: Field[] }) => <div className="sr-col">{fields.map(([label, value], i) => <div className="sr-row" key={label + i}><b>{label}</b><Value v={value} /></div>)}</div>;

function Header({ m }: { m: SamplingReportModel }) {
  const h = m.header, i = m.input;
  const cell = (label: string, value: string) => <div><b>{label}</b><span>{value}</span></div>;
  return <header className="sr-head">
    <div className="sr-head-logo">{i.company.logo ? <img src={assetUrl(i.company.logo)} alt={i.company.displayName} /> : <strong>{i.company.displayName}</strong>}</div>
    <div className="sr-hc">{cell('Client', h.client)}{cell('Job No', h.jobNo)}{cell('Date', h.date)}{cell('Field', h.field)}{cell('Well', h.well)}{cell('Installation', h.installation)}</div>
    <div className="sr-head-client">{i.clientLogo && <img src={assetUrl(i.clientLogo)} alt="" />}</div>
  </header>;
}
/** Page frame shared by every page: top accent, bottom wave, footer line, tagline and website. */
function Footer({ m, n }: { m: SamplingReportModel; n: number }) {
  const status = m.input.approved ? 'Approved' : m.input.status;
  return <>
    <div className="sr-top" aria-hidden="true" />
    <img className="sr-wave" src={WAVE} alt="" />
    <footer className="sr-foot"><span>{m.input.jobNumber}{m.input.version ? ` · Version ${m.input.version}` : ''} · {status}</span><b>{m.input.company.displayName || 'VAPS'} Confidential</b><span>{n > 1 ? `Page ${n} of ${m.totalPages}` : ''}</span></footer>
    <span className="sr-tagline">{TAGLINE}</span>
    {website(m) && <span className="sr-web">{website(m)}</span>}
  </>;
}
function Sheet({ s }: { s: SampleSheet }) {
  return <>
    <h1 className="sr-sheet-title">{s.title}</h1>
    <div className="sr-sec b">Identification</div>
    <div className="sr-pairs sr-ident"><Rows fields={s.identification.left} /><Rows fields={s.identification.right} /></div>
    <div className="sr-sec g">Shipping Conditions</div>
    <div className="sr-pairs sr-ship"><Rows fields={s.shipping.left} /><Rows fields={s.shipping.right} /></div>
    <div className="sr-sec b">Matched With Samples</div>
    <div className="sr-pairs sr-matched"><Rows fields={s.matched.left} /><Rows fields={s.matched.right} /></div>
    <div className="sr-sec g">Production Conditions During Sampling</div>
    <div className="sr-prod">{s.production.map((c, i) => <Rows key={i} fields={c} />)}</div>
    <div className="sr-sec b">Remarks</div>
    <p className="sr-remarks"><Value v={unwrap(s.remarks)} /></p>
    {s.remarksContinue && <p className="sr-more">Remarks continue on the next page.</p>}
  </>;
}

/** The complete Sampling and Analysis Report as A4 pages. */
export function SamplingReportDocument({ input }: { input: SamplingReportInput }) {
  const m = buildSamplingReport(input);
  const c = m.cover;
  // The logo already carries the short name, so the cover shows the full company name beside it (short name only when there is no logo).
  const companyTitle = input.company.name && input.company.name !== input.company.displayName ? input.company.name : input.company.logo ? '' : input.company.displayName;
  return <div className="sr-doc" data-report-pages={m.totalPages}>
    <style>{samplingReportCss}</style>
    {m.pages.map(page => {
      const draft = !input.approved && <div className="sr-draft" aria-hidden="true">DRAFT — NOT APPROVED</div>;
      if (page.kind === 'cover') return <section className="sr-page sr-cover" key="cover">
        {draft}
        <div className="sr-banner">
          <div className="sr-brand">{input.company.logo && <img src={assetUrl(input.company.logo)} alt={input.company.displayName} />}{companyTitle && <strong>{companyTitle}</strong>}</div>
          <div className="sr-brand sr-brand-client">{input.clientLogo && <img src={assetUrl(input.clientLogo)} alt="" />}<strong>{c.clientTitle}</strong></div>
        </div>
        <div className="sr-cover-title"><h1>Sampling and<br />Analysis Report</h1></div>
        <dl className="sr-cover-facts">
          <div><dt>Job No</dt><dd>{m.header.jobNo}</dd></div><div><dt>Field</dt><dd>{m.header.field}</dd></div><div><dt>Well</dt><dd>{c.well}</dd></div>
          <div className="wide"><dt>Test</dt><dd>{c.test}</dd></div><div><dt>Date</dt><dd>{c.date}</dd></div>
        </dl>
        <div className="sr-approval">
          <div><small>Prepared by</small><strong>{c.prepared.name}</strong><i>{c.prepared.date}</i><span>{c.prepared.title}</span></div>
          <div><small>Approved by</small>{c.approval ? <><strong>{c.approval.name}</strong><i>{c.approval.date}</i><span>{c.approval.title}</span></> : <em>Pending approval</em>}</div>
        </div>
        {input.notice && <p className="sr-notice">{input.notice}</p>}
        <Footer m={m} n={1} />
      </section>;
      let body: ReactNode = null;
      if (page.kind === 'index') body = <><h1 className="sr-h1">Index</h1><div className="sr-index">{m.index.map(e => <div key={e.no}><b>{e.no}</b><span>{e.title}</span><i>{e.pages === '–' ? '' : `Page ${e.pages}`}</i></div>)}</div></>;
      if (page.kind === 'summary') body = <><h2 className="sr-h2">Summary{page.continued ? ' (continued)' : ''}</h2><div className="sr-summary">{page.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>{page.last && <div className="sr-bar" aria-hidden="true" />}</>;
      if (page.kind === 'listing') body = <><h1 className="sr-h1">Sample Listing{page.continued ? ' (continued)' : ''}</h1><div className="sr-well">WELL: <span>{m.header.well}</span></div>
        <table className="sr-table"><thead><tr><th className="b">Sample No:</th><th className="g">Sample Date:</th><th className="b">Sample Time:</th><th className="g">Sample Nature</th><th className="b">Sample Point:</th><th className="g">Cylinder Type/No:</th></tr></thead>
          <tbody>{page.rows.map((r, i) => <tr key={r.sampleNo + i}><td>{r.sampleNo}</td><td>{r.date}</td><td>{r.time}</td><td>{r.nature}</td><td>{r.point}</td><td>{r.bottle}</td></tr>)}</tbody></table>
        {!page.rows.length && <p className="sr-empty">No samples are recorded for this job.</p>}</>;
      if (page.kind === 'events') body = <><h1 className="sr-h1">Sequence Of Events{page.continued ? ' (continued)' : ''}</h1><div className="sr-well sr-events-well">WELL: <span>{m.header.well}</span></div>
        <table className="sr-table sr-events"><colgroup><col style={{ width: '18%' }} /><col style={{ width: '17%' }} /><col /></colgroup><thead><tr><th className="b">Date</th><th className="g">Time</th><th className="b">Event</th></tr></thead>
          <tbody>{page.rows.map((r, i) => <tr key={i}><td>{r.date}</td><td>{r.time}</td><td>{r.event}</td></tr>)}</tbody></table>
        {!page.rows.length && <p className="sr-empty">No sequence-of-events entries were recorded.</p>}</>;
      if (page.kind === 'sheet') body = <Sheet s={page.sheet} />;
      if (page.kind === 'remarks') body = <><h1 className="sr-sheet-title">{page.title}</h1><div className="sr-sec b">Remarks (continued) – Sample No: {page.sampleId}</div><p className="sr-remarks">{unwrap(page.lines)}</p>{page.more && <p className="sr-more">Remarks continue on the next page.</p>}</>;
      return <section className="sr-page" key={page.kind + page.number}>{draft}<Header m={m} /><div className="sr-body">{body}</div><Footer m={m} n={page.number} /></section>;
    })}
  </div>;
}

/**
 * Opens the browser's print dialog for the report only.
 * The browser's print engine keeps text selectable and logos sharp, unlike a canvas screenshot.
 */
export async function exportSamplingReportPdf(element: HTMLElement, title: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument, win = frame.contentWindow;
  if (!doc || !win) { frame.remove(); throw Error('The print view could not be opened.'); }
  const safeTitle = title.replace(/[<>&"]/g, '');
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><base href="${location.origin}${basePath}"></head><body style="margin:0;background:#fff">${element.outerHTML}</body></html>`);
  doc.close();
  await Promise.all(Array.from(doc.images).map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = img.onerror = () => resolve(null); })));
  await (doc.fonts?.ready ?? Promise.resolve());
  const previous = document.title;
  document.title = safeTitle; // Chrome suggests the top document's title as the PDF file name.
  const cleanup = () => { document.title = previous; setTimeout(() => frame.remove(), 1000); };
  win.addEventListener('afterprint', cleanup, { once: true });
  win.focus();
  win.print();
  setTimeout(() => { if (document.title === safeTitle) document.title = previous; }, 60000);
}

/**
 * Downloads the report as an A4 PDF file directly, without the print dialog.
 * Each report page is rendered on its own PDF page, so page breaks match the preview exactly.
 */
export async function downloadSamplingReportPdf(element: HTMLElement, title: string): Promise<void> {
  const pages = Array.from(element.querySelectorAll<HTMLElement>('.sr-page'));
  if (!pages.length) throw Error('The report has no pages.');
  const html2pdf = (await import('html2pdf.js')).default;
  const options = { margin: 0, filename: `${title.replace(/[<>&"/\\:*?|]/g, '')}.pdf`, image: { type: 'jpeg' as const, quality: 0.98 }, html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true }, jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const } };
  // One A4 page per source: 794 × 1122 px is just inside A4 at 96 dpi, so a page never spills onto a second sheet.
  const single = (page: HTMLElement) => {
    const holder = document.createElement('div');
    holder.className = element.className;
    const copy = page.cloneNode(true) as HTMLElement;
    copy.style.cssText += ';margin:0;box-shadow:none;width:794px;height:1122px';
    holder.appendChild(copy);
    return holder;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- html2pdf's chained worker is not fully typed
  let worker: any = html2pdf().set(options).from(single(pages[0])).toPdf();
  for (const page of pages.slice(1)) worker = worker.get('pdf').then((pdf: { addPage: () => void }) => { pdf.addPage(); }).from(single(page)).toContainer().toCanvas().toPdf();
  // The app's base styles make images block-level, which makes the PDF renderer draw all text too low; undo that while it runs.
  const fix = document.createElement('style');
  fix.textContent = 'body > div:last-child img{display:inline-block}';
  document.head.appendChild(fix);
  try { await worker.save(); } finally { fix.remove(); }
}
