#!/usr/bin/env node
// Checks a VAPS browser export and, optionally, imports it into a local staging database.
//
//   node scripts/vaps-import.mjs <export.json>                       report only (nothing is written)
//   node scripts/vaps-import.mjs <export.json> --apply staging.sqlite import into a local SQLite staging copy
//   add --include-demo to import the fictional DEMO jobs as well
//
// Runs on this computer only: the export file is read locally and nothing is sent anywhere. The report shows IDs and
// counts, not record contents. Importing into the shared database comes with the administrator page (Phase A).
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { d1 } from './d1-sqlite.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--apply');
const target = args.includes('--apply') ? args[args.indexOf('--apply') + 1] : null;
if (!file || (args.includes('--apply') && !target)) { console.error('Usage: node scripts/vaps-import.mjs <export.json> [--apply staging.sqlite] [--include-demo]'); process.exit(2); }

const out = await build({ entryPoints: [new URL('../server/import.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const { planImport, applyImport, planReport } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

const db = d1(target || ':memory:');
const plan = await planImport(db, readFileSync(file, 'utf8'), { includeDemo: args.includes('--include-demo') });
console.log(planReport(plan));
if (!target) { console.log(plan.problems.length ? '' : '\nReport only. Add --apply <staging.sqlite> to import into a local staging copy.'); process.exit(plan.problems.length ? 1 : 0); }
if (plan.problems.length) process.exit(1);
const { added } = await applyImport(db, plan, 'MA001');
console.log(`\nImported into ${target}: ${added.setting} settings, ${added.job} jobs, ${added.request} request book entries, ${added.archive} archived records.`);
