import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
test('legacy approved document requires evidence while the register includes drafts', () => {
 assert.match(page, /report\.reportStatus === "Completed" && report\.approvedBy === "SALIM" && report\.approvedAt && <article/);
 assert.ok(page.includes('item.operations?.samplingReports.length || item.report?.preparedBy || item.report?.summary'));
 assert.match(page, /if \(report.reportStatus !== "Completed" \|\| report.approvedBy !== "SALIM" \|\| !report.approvedAt\) return/);
});
test('approval reviews complete data and rejects unsaved sample changes', () => {
 assert.match(page, /<ReviewData value={sample}/);
 assert.match(page, /events: sortedEvents/);
 assert.match(page, /JSON.stringify\(samples\) !== JSON.stringify\(currentJob.samples\)/);
 assert.match(page, /currentEmployee.id !== "SALIM"/);
});
