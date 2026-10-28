import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
process.env.TZ = 'Asia/Muscat';
const moduleURL=p=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const {localDate,addDays}=await import(moduleURL('app/local-date.ts'));
test('dates follow Oman local time, not UTC, between midnight and 04:00',()=>{const at2am=new Date('2026-10-28T02:00:00+04:00');assert.equal(at2am.toISOString().slice(0,10),'2026-10-27');assert.equal(localDate(at2am),'2026-10-28');});
test('adding days crosses month and year ends',()=>{assert.equal(addDays('2026-10-28',7),'2026-11-04');assert.equal(addDays('2026-12-30',3),'2027-01-02');});
