import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const store = new Map(); globalThis.window = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) } }; globalThis.localStorage = window.localStorage;
test('external client sharing stays off: nothing is created or published, in either edition', async () => {
  const { clientSharingEnabled } = await bundle('app/deployment.ts');
  assert.equal(clientSharingEnabled, false);
  let calls = 0; globalThis.fetch = async () => { calls++; return new Response('{}'); };
  const { syncShare, getShare } = await bundle('app/job-sharing.ts');
  const job = { id: 'OM-X-26-001', clientName: 'DEMO', samples: [], requiredTests: [], lastUpdatedAt: '2026-11-08T00:00:00Z' };
  assert.equal(await syncShare(job, 'signed-in'), undefined);
  assert.equal(getShare(job.id), undefined, 'no share record created');
  assert.equal(calls, 0, 'no request to the summary API');
  assert.match(fs.readFileSync('app/job-qr.tsx', 'utf8'), /if \(!clientSharingEnabled\) return <SharingOff/);
});
