import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
// Found while testing the sampling forms through the interface: a refused save must never be reported as saved.
test('draft saves confirm only when the job was actually saved', () => {
 assert.match(page, /function updateCurrentJob\([^)]*\): boolean/);
 for (const message of ['Sampling Preparation draft saved on this device.', 'Sampling Data draft saved on this device.', 'Sampling report draft saved on this device.']) {
  assert.match(page, new RegExp(`if \\(updateCurrentJob\\([^;]*\\)\\) setNotice\\("${message.replace('.', '\\.')}"\\)`), message);
 }
 assert.equal(page.includes('draft saved to local demo data'), false, 'no unconditional save messages remain');
});
test('submitted or approved sampling data is read-only in the editor and events revert when refused', () => {
 assert.match(page, /<fieldset className="locked-fieldset" disabled=\{samplingFlow && samplingDataLocked\(currentJob!\)\}>/);
 assert.match(page, /if \(!updateCurrentJob\([^;]*"Created Sequence of Events entry"[^;]*\)\) \{ setEvents\(events\); return; \}/);
 assert.match(page, /"Removed Sequence of Events entry"[^;]*\)\) setEvents\(events\);/);
 assert.match(page, /className="sample-data-errors" role="alert"/);
});
