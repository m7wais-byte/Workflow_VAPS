import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
test('legacy approved document requires evidence while the register includes drafts', () => {
 // Display depends on recorded approval evidence, never on who holds the duty today.
 assert.match(page, /report\.reportStatus === "Completed" && !!report\.approvedBy && report\.approvedAt && <article/);
 assert.ok(page.includes('item.operations?.samplingReports.length || item.report?.preparedBy || item.report?.summary'));
 assert.match(page, /if \(report.reportStatus !== "Completed" \|\| !report.approvedBy \|\| !report.approvedAt\) return/);
 assert.equal(page.includes('"SALIM"'), false, 'no hardcoded approver remains');
});
test('approval reviews complete data and rejects unsaved sample changes', () => {
 assert.match(page, /<ReviewData value={sample}/);
 assert.match(page, /events: sortedEvents/);
 assert.match(page, /JSON.stringify\(samples\) !== JSON.stringify\(currentJob.samples\)/);
 assert.match(page, /currentEmployee.id !== samplingApprover/);
 assert.match(page, /roleHolder\(responsibilities, "samplingApproval", demoEmployees\)/);
 assert.match(page, /approvedBy: currentEmployee.id, approvalDate/, 'the approval records who actually signed');
});
