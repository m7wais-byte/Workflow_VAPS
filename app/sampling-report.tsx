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
.sr-doc{--sr-blue:#3d6fd4;--sr-green:#5cb51c;--sr-ink:#111;font-family:Arial,"Liberation Sans",Helvetica,sans-serif;color:var(--sr-ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sr-doc *{box-sizing:border-box}
.sr-doc .sr-page :is(h1,h2,p,span,b,strong,small,em,table,th,td,div,section,header,footer){font-family:inherit;color:inherit;letter-spacing:normal;text-transform:none;text-shadow:none}
.sr-doc :where(h1,h2,p){margin:0;max-width:none}
.sr-page{position:relative;width:210mm;height:297mm;padding:16mm 20mm 0 20mm;background:#fff;overflow:hidden;margin:0 auto 8mm;box-shadow:0 1px 6px rgba(15,23,42,.25)}
.sr-doc .sr-page .sr-head{display:grid;grid-template-columns:15mm 47mm 19mm 1fr 40mm;align-items:end;column-gap:2mm;height:20mm;border-bottom:1.6pt solid #111;padding-bottom:1mm;font-size:7.5pt}
.sr-hc{display:grid;grid-template-rows:repeat(3,4.6mm);align-items:end;min-width:0}
.sr-hc b{font-weight:700}
.sr-hc span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sr-head .sr-head-logo{align-self:center;height:17mm;border:0.6pt solid #555;border-radius:2.5mm;display:flex;align-items:center;justify-content:center;padding:1mm 2mm;margin-bottom:1mm}
.sr-head .sr-head-logo img{max-height:14mm;max-width:100%;object-fit:contain}
.sr-body{height:214mm;margin-top:3mm;overflow:hidden}
.sr-doc .sr-page .sr-foot{position:absolute;left:20mm;right:20mm;bottom:22mm;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);column-gap:3mm;font-size:7pt;color:#555}
.sr-foot b{font-size:9pt;font-weight:400;color:#111}
.sr-foot span:last-child{text-align:right}
.sr-draft{position:absolute;left:0;right:0;top:44%;text-align:center;transform:rotate(-30deg);font-size:40pt;font-weight:700;letter-spacing:2mm;color:rgba(190,30,30,.10);pointer-events:none;white-space:nowrap}
.sr-h1{font-size:16pt;font-weight:700;margin:0;height:12mm;display:flex;align-items:center}
.sr-h2{font-size:10.5pt;font-weight:700;margin:0;height:9mm;display:flex;align-items:center}
/* Cover */
.sr-cover{padding-top:24mm}
.sr-banner{display:grid;grid-template-columns:1fr 1fr;border:1.8pt solid #111;height:25mm}
.sr-banner>div{display:flex;align-items:center;gap:3mm;padding:2mm 4mm;min-width:0}
.sr-banner>div+div{border-left:1.8pt solid #111}
.sr-banner img{max-height:19mm;max-width:30mm;object-fit:contain;flex:none}
.sr-banner strong{font-size:10.5pt;line-height:1.2;overflow-wrap:anywhere}
.sr-banner small{font-size:7pt;letter-spacing:.2mm;text-transform:uppercase;line-height:1.3;overflow-wrap:anywhere}
.sr-address{margin:10mm 0 0 92mm;font-size:8.5pt;line-height:1.35;white-space:pre-line;min-height:14mm}
.sr-cover-title{margin:16mm 0 0 25mm;width:120mm;text-align:center}
.sr-cover-title p{font-size:13pt;font-weight:700;margin:0 0 2mm;overflow-wrap:anywhere}
.sr-cover-title hr{border:0;border-top:2pt solid #111;margin:0 0 4mm}
.sr-cover-title h1{font-size:17pt;margin:0}
.sr-cover-facts{display:grid;grid-template-columns:16mm 6mm 1fr;row-gap:2.6mm;margin:5mm 0 0 45mm;font-size:8.5pt;width:110mm}
.sr-cover-facts dt{font-weight:700}
.sr-cover-facts dd{margin:0;overflow-wrap:anywhere}
.sr-approval{position:absolute;left:20mm;right:20mm;top:212mm;border-collapse:collapse;width:170mm;font-size:8pt;table-layout:fixed}
.sr-approval td{border:0.8pt solid #111;vertical-align:top;padding:1mm 1.5mm;height:14mm;line-height:1.3;overflow-wrap:anywhere}
.sr-approval td span{display:block}
.sr-approval em{color:#666;font-style:italic}
.sr-approval{outline:1.4pt solid #111}
.sr-notice{position:absolute;left:20mm;right:20mm;top:232mm;font-size:7pt;line-height:1.35;color:#555;font-style:italic}
/* Index */
.sr-index{margin:58mm 0 0 25mm;display:grid;grid-template-columns:7mm 6mm 80mm 20mm;row-gap:5mm;font-size:11pt}
.sr-index span:nth-child(4n){text-align:right;font-size:9pt;color:#444;align-self:center}
/* Summary */
.sr-summary{padding:2mm 4mm 0 2mm;font-size:9.5pt;line-height:4.6mm}
.sr-summary p{margin:0 0 4mm}
.sr-bar{margin:12mm 4mm 0 8mm;height:9mm;background:linear-gradient(var(--sr-blue) 0 50%,var(--sr-green) 50% 100%)}
/* Tables */
.sr-well{font-size:7.5pt;font-weight:700;height:9mm;display:flex;align-items:center;gap:7mm}
.sr-well span{font-weight:400}
.sr-events-well{height:7mm;align-items:flex-start}
.sr-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5pt}
.sr-table th,.sr-table td{border:0.8pt solid #111;padding:1.3mm 1.2mm;text-align:center;vertical-align:middle;line-height:3.7mm;overflow-wrap:anywhere}
.sr-table tr{break-inside:avoid}
.sr-table thead th{height:10mm;font-weight:700}
.sr-table td{height:8.4mm;font-weight:700}
.sr-table .b{background:var(--sr-blue)}.sr-table .g{background:var(--sr-green)}
.sr-events th{height:9mm;font-weight:400}
.sr-events td{height:9mm;font-weight:400;padding:2.5mm 1.2mm}
.sr-events td:first-child,.sr-events td:nth-child(2){font-weight:700}
.sr-events th:last-child,.sr-events td:last-child{text-align:left}
.sr-empty{font-size:8.5pt;font-style:italic;color:#444;padding:3mm 0}
/* Sample data sheet */
.sr-sheet-title{font-size:16pt;font-weight:700;margin:0;height:15mm;display:flex;align-items:center}
.sr-sec{height:5.4mm;margin:.8mm 0 .8mm;padding:0 1mm;font-size:9pt;font-weight:700;display:flex;align-items:center}
.sr-sec.b{background:var(--sr-blue)}.sr-sec.g{background:var(--sr-green)}
.sr-pairs{display:grid;grid-template-columns:1fr 1fr;column-gap:4mm;font-size:7.6pt}
.sr-col{display:flex;flex-direction:column}
.sr-row{display:grid;min-height:6.6mm;align-items:center;column-gap:2mm}
.sr-row b{font-weight:700}
.sr-row span{overflow-wrap:anywhere;line-height:3.4mm}
.sr-ident .sr-row{grid-template-columns:26mm 1fr}
.sr-ship .sr-row{grid-template-columns:34mm 1fr}
.sr-ship .sr-col+.sr-col .sr-row,.sr-ident .sr-col+.sr-col .sr-row{grid-template-columns:27mm 1fr}
.sr-matched .sr-row{grid-template-columns:34mm 1fr}
.sr-matched .sr-col+.sr-col{padding-left:8mm}
.sr-matched .sr-col+.sr-col .sr-row{grid-template-columns:27mm 1fr}
.sr-prod{display:grid;grid-template-columns:44mm 54mm 1fr;column-gap:3mm;font-size:7.6pt}
.sr-prod .sr-col:nth-child(1) .sr-row{grid-template-columns:19mm 1fr}
.sr-prod .sr-col:nth-child(2) .sr-row{grid-template-columns:27mm 1fr}
.sr-prod .sr-col:nth-child(3) .sr-row{grid-template-columns:31mm 1fr}
.sr-nr{color:#666;font-style:italic;font-weight:400}
.sr-remarks{font-size:8pt;line-height:4mm;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
.sr-more{font-size:7pt;color:#555;font-style:italic;margin-top:1mm}
@media print{
 html,body{margin:0;padding:0;background:#fff}
 .sr-page{margin:0;box-shadow:none;break-after:page;page-break-after:always}
 .sr-page:last-child{break-after:auto;page-break-after:auto}
}
`;

const Value = ({ v }: { v: string }) => v === NOT_RECORDED ? <span className="sr-nr">{v}</span> : <span>{v}</span>;
const Rows = ({ fields }: { fields: Field[] }) => <div className="sr-col">{fields.map(([label, value], i) => <div className="sr-row" key={label + i}><b>{label}</b><Value v={value} /></div>)}</div>;

function Header({ m }: { m: SamplingReportModel }) {
  const h = m.header;
  return <header className="sr-head">
    <div className="sr-hc"><b>Client:</b><b>Job No:</b><b>Date:</b></div><div className="sr-hc"><span>{h.client}</span><span>{h.jobNo}</span><span>{h.date}</span></div>
    <div className="sr-hc"><b>Field:</b><b>Well:</b><b>Installation:</b></div><div className="sr-hc"><span>{h.field}</span><span>{h.well}</span><span>{h.installation}</span></div>
    <div className="sr-head-logo">{m.input.company.logo ? <img src={assetUrl(m.input.company.logo)} alt={m.input.company.displayName} /> : <strong>{m.input.company.displayName}</strong>}</div>
  </header>;
}
function Footer({ m, n }: { m: SamplingReportModel; n: number }) {
  const status = m.input.approved ? 'Approved' : m.input.status;
  return <footer className="sr-foot"><span>{m.input.jobNumber}{m.input.version ? ` · Version ${m.input.version}` : ''} · {status}</span><b>{m.input.company.displayName || 'VAPS'} Confidential</b><span>{n > 1 ? `Page ${n} of ${m.totalPages}` : ''}</span></footer>;
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
  return <div className="sr-doc" data-report-pages={m.totalPages}>
    <style>{samplingReportCss}</style>
    {m.pages.map(page => {
      const draft = !input.approved && <div className="sr-draft" aria-hidden="true">DRAFT — NOT APPROVED</div>;
      if (page.kind === 'cover') return <section className="sr-page sr-cover" key="cover">
        {draft}
        <div className="sr-banner">
          <div>{input.clientLogo && <img src={assetUrl(input.clientLogo)} alt="" />}<strong>{c.clientTitle}</strong></div>
          <div>{input.company.logo && <img src={assetUrl(input.company.logo)} alt={input.company.displayName} />}<span><strong>{input.company.displayName}</strong>{input.company.name && input.company.name !== input.company.displayName && <><br /><small>{input.company.name}</small></>}</span></div>
        </div>
        <p className="sr-address">{[input.company.address, input.company.address ? input.company.country : ''].filter(Boolean).join('\n')}</p>
        <div className="sr-cover-title"><p>{c.clientTitle}</p><hr /><h1>Sampling and Analysis Report</h1></div>
        <dl className="sr-cover-facts"><dt>Well:</dt><dd>-</dd><dd>{c.well}</dd><dt>Test:</dt><dd>-</dd><dd>{c.test}</dd><dt>Date:</dt><dd>-</dd><dd>{c.date}</dd></dl>
        <table className="sr-approval"><colgroup><col style={{ width: '36%' }} /><col style={{ width: '14%' }} /><col style={{ width: '36%' }} /><col style={{ width: '14%' }} /></colgroup><tbody><tr>
          <td><span>Prepared By:</span><span>{c.prepared.name}</span><span>{c.prepared.title}</span></td>
          <td><span>Date :</span><span>{c.prepared.date}</span></td>
          <td><span>Approved By:</span>{c.approval ? <><span>{c.approval.name}</span><span>{c.approval.title}</span></> : <em>Pending approval</em>}</td>
          <td><span>Date :</span><span>{c.approval?.date || ''}</span></td>
        </tr></tbody></table>
        {input.notice && <p className="sr-notice">{input.notice}</p>}
        <Footer m={m} n={1} />
      </section>;
      let body: ReactNode = null;
      if (page.kind === 'index') body = <><h1 className="sr-h1">Index</h1><div className="sr-index">{m.index.map(e => [<span key={e.no + 'n'}>{e.no}</span>, <span key={e.no + 'd'}>-</span>, <span key={e.no + 't'}>{e.title}</span>, <span key={e.no + 'p'}>{e.pages === '–' ? '' : `Page ${e.pages}`}</span>])}</div></>;
      if (page.kind === 'summary') body = <><h2 className="sr-h2">Summary{page.continued ? ' (continued)' : ''}</h2><div className="sr-summary">{page.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>{page.last && <div className="sr-bar" aria-hidden="true" />}</>;
      if (page.kind === 'listing') body = <><h1 className="sr-h1">Sample Listing{page.continued ? ' (continued)' : ''}</h1><div className="sr-well">Well No: <span>{m.header.well}</span></div>
        <table className="sr-table"><thead><tr><th className="b">Sample No:</th><th className="g">Sample Date:</th><th className="b">Sample Time:</th><th className="g">Sample Nature</th><th className="b">Sample Point:</th><th className="g">Cylinder Type/No:</th></tr></thead>
          <tbody>{page.rows.map((r, i) => <tr key={r.sampleNo + i}><td>{r.sampleNo}</td><td>{r.date}</td><td>{r.time}</td><td>{r.nature}</td><td>{r.point}</td><td>{r.bottle}</td></tr>)}</tbody></table>
        {!page.rows.length && <p className="sr-empty">No samples are recorded for this job.</p>}</>;
      if (page.kind === 'events') body = <><h1 className="sr-h1">Sequence Of Events{page.continued ? ' (continued)' : ''}</h1><div className="sr-well sr-events-well">WELL: {m.header.well}</div>
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
 * Opens the browser's print dialog for the report only (choose "Save as PDF").
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
