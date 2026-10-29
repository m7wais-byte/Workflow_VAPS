// 27 fictional jobs (DEMO) for the My work inbox tests and screenshots. Every job is advanced with the real
// workflow commands, so each is a state the app can reach on its own. QC review is deliberately unassigned
// to exercise the "blocked by a missing setting" state.
export const inboxRoles = (defaults) => ({ ...defaults, labReceipt: 'SHEREIQI', qcReviewer: '' });
export const inboxTeams = { PVT: ['NASSER', 'RANJITH', 'AHAD'], Chemical: ['YAQEEN'] };
export const inboxRouting = { 'Black Oil — DL': 'PVT', 'Black Oil — Sep Test': 'PVT', 'Gas Condensates (GC) — CVD': 'PVT', 'Others — Water Analysis': 'Chemical' };

const clients = [
  'DEMO Al Wusta Petroleum Development & Production Services LLC', 'DEMO Northern Desert Gas Condensate Operations Company',
  'DEMO Oman Coastal Exploration', 'DEMO Musandam Offshore Production Joint Venture', "DEMO Rub' al Khali Integrated Energy Partners",
  'DEMO Interior Fields Water & Gas Injection Services', 'DEMO Al Batinah Gas Gathering', 'DEMO Central Oman Heavy Oil Recovery Project',
  'DEMO Fahud Region Production Support', 'DEMO Dhofar Upstream Services',
];

export function buildInboxJobs({ applyOperation, employees, policy, roles, today, addDays }) {
  const teams = inboxTeams;
  let tick = 0;
  const at = () => new Date(Date.parse(addDays(today, -12) + 'T06:00:00Z') + (tick++) * 600000).toISOString();
  const run = (job, by, command) => applyOperation(job, command, { id: by, employees, policy, roles, teams, routing: inboxRouting }, at());
  const sample = (id, complete = true) => ({ id, sampler: '', bottle: 'PDS', samplerSerial: '', bottleSerial: 'DEMO-B-' + id.replace('.', '') + (tick % 97), bottleCapacity: '600', calibrationStatus: 'Passed', pressureTestStatus: 'Passed', equipmentCondition: 'Good', preparedBy: 'MOHSIN', preparedAt: at(),
    fieldData: { sampleNature: 'WHS', samplingDate: addDays(today, -6), samplingTime: '09:40' }, dataComplete: complete, dataCompletedBy: complete ? 'MOHSIN' : '', dataCompletedAt: complete ? at() : '', pressure: '', temperature: '', depth: '', notes: '' });
  const job = (seq, { client = clients[seq % clients.length], due = 10, samples = ['1.01'], tests = ['Black Oil — DL', 'Others — Water Analysis'], prep = true, draft = false, complete = true } = {}) => {
    const id = 'OM-P-26-' + String(100 + seq);
    return { id, jobNumber: id, globalSequence: seq, clientCode: 'P', clientName: client, countryCode: 'OM', fieldArea: 'DEMO Field', well: 'DEMO-WH-' + seq, samplingSource: 'Wellhead Sampling', samplingInstructions: 'DEMO instructions.',
      description: 'DEMO job, fictional data.', requiredTests: tests, status: draft ? 'Draft' : 'Job Created', currentStage: 'Job Setup', nextAction: '', ownerId: 'SALIM', responsibleId: 'SALIM', jobResponsibleId: 'SALIM', createdById: 'SALIM', createdAt: at(), lastUpdatedAt: at(), events: [],
      stages: [{ name: 'Job Setup', status: 'Completed' }, { name: 'Sampling Preparation', status: prep ? 'Completed' : 'In Progress' }], dueDate: addDays(today, due),
      samples: samples.map((s) => sample(s, complete)) };
  };
  const dispatch = (j, engineer = 'MOHSIN') => run(j, 'SALIM', { type: 'dispatch', engineer, driver: 'ALI' });
  const submitted = (j, engineer = 'MOHSIN') => run(dispatch(j, engineer), engineer, { type: 'data-submit', note: 'DEMO data submitted.' });
  const approvedData = (j, engineer = 'MOHSIN') => run(submitted(j, engineer), 'SALIM', { type: 'data-approve' });
  const reportSubmitted = (j, engineer = 'MOHSIN') => { j = run(approvedData(j, engineer), engineer, { type: 'report-draft', kind: 'sampling', text: 'DEMO sampling report.', checker: '' }); return run(j, engineer, { type: 'report-action', kind: 'sampling', action: 'submit', comments: '' }); };
  const reportApproved = (j, engineer = 'MOHSIN') => run(reportSubmitted(j, engineer), 'SALIM', { type: 'report-action', kind: 'sampling', action: 'approve', comments: '' });
  const received = (j, engineer) => { j = run(reportApproved(j, engineer), 'ALI', { type: 'handover-send', sampleIds: j.samples.map((s) => s.id), notes: 'DEMO transfer.' }); return run(j, 'SHEREIQI', { type: 'handover-receive', notes: 'DEMO receipt.' }); };
  const conditions = { pressure: '', pressureUnit: 'psi', temperature: '', temperatureUnit: '°C', notes: '' };
  const scoped = (j, items, engineer) => run(received(j, engineer), 'SALIM', { type: 'scope', reason: 'DEMO original request.', conditions, items });
  const act = (j, title, sampleId) => j.operations.activities.find((a) => a.title === title && a.sampleId === sampleId).id;
  const schedule = (j, title, sampleId, owner, dueIn, notes = 'DEMO instructions.') => run(j, owner === 'YAQEEN' ? 'BAHRI' : 'SHEREIQI', { type: 'schedule', id: act(j, title, sampleId), owner, start: addDays(today, dueIn - 4), due: addDays(today, dueIn), conditions: '', notes });
  const start = (j, title, sampleId, owner) => run(j, owner, { type: 'progress', id: act(j, title, sampleId), status: 'In Progress', notes: 'Started.' });
  const file = (n) => ({ id: 'demo-wb-' + n + '-' + tick, name: `DEMO workbook ${n}.xlsx`, size: 2048, type: 'application/vnd.ms-excel' });
  const submitWb = (j, title, sampleId, owner) => run(j, owner, { type: 'workbook', id: act(j, title, sampleId), file: file(title + sampleId), notes: 'DEMO workbook.' });
  const leadReturn = (j, title, sampleId, comments) => run(j, 'SHEREIQI', { type: 'lead-review', id: act(j, title, sampleId), decision: 'return', target: 'Liberation sheet', comments });
  const leadApprove = (j, title, sampleId) => run(j, 'SHEREIQI', { type: 'lead-review', id: act(j, title, sampleId), decision: 'approve', target: '', comments: '' });
  const pvt = (title, sampleIds) => ({ title, sampleIds, stream: 'PVT' });
  const chem = (sampleIds) => ({ title: 'Others — Water Analysis', sampleIds, stream: 'Chemical' });

  const jobs = [];
  // Salim: drafts, data and report reviews, scope, additional work; waiting on work he returned or dispatched.
  jobs.push(job(1, { draft: true, due: 18 }));
  jobs.push(dispatch(job(2, { prep: false, due: 9 })));
  jobs.push(dispatch(job(3, { complete: false, due: 6 })));
  jobs.push(submitted(job(4, { due: -2, samples: ['1.01', '1.02'] }), 'HUSSEINI'));
  jobs.push(submitted(job(5, { due: 4 })));
  jobs.push(run(submitted(job(6, { due: 3 })), 'SALIM', { type: 'data-return', general: 'Sample 1.01 needs correction before approval.', comments: [{ target: 'sample:1.01', label: 'Sample 1.01', text: 'Wellhead temperature is missing; confirm from the field sheet.' }] }));
  jobs.push(reportSubmitted(job(7, { due: -1 }), 'HUSSEINI'));
  jobs.push(run(reportSubmitted(job(8, { due: 5 })), 'SALIM', { type: 'report-action', kind: 'sampling', action: 'return', comments: 'Add the separator conditions to the summary table.' }));
  jobs.push(reportApproved(job(9, { due: 12 })));
  jobs.push(run(reportApproved(job(10, { due: 8 })), 'ALI', { type: 'handover-send', sampleIds: ['1.01'], notes: 'DEMO transfer.' }));
  let j = scoped(job(11, { due: 15 }), [pvt('Black Oil — DL', ['1.01']), chem(['1.01'])]);
  jobs.push(run(j, 'SHEREIQI', { type: 'request-addition', title: 'Black Oil — Sep Test', reason: 'DEMO client asked for a separator test.' }));
  jobs.push(scoped(job(12, { due: 11 }), [pvt('Black Oil — DL', ['1.01']), chem(['1.01'])]));
  // Nasser (PVT team member): new, overdue, returned, several tests on one job, waiting and blocked work.
  const lab = (seq, opts, items) => scoped(job(seq, opts), items);
  j = lab(13, { due: 9, tests: ['Black Oil — DL'] }, [pvt('Black Oil — DL', ['1.01'])]); jobs.push(schedule(j, 'Black Oil — DL', '1.01', 'NASSER', 5, 'Use the 700 cc transfer cylinder.'));
  j = lab(14, { due: 2, tests: ['Black Oil — Sep Test'] }, [pvt('Black Oil — Sep Test', ['1.01'])]); j = schedule(j, 'Black Oil — Sep Test', '1.01', 'NASSER', -1); jobs.push(start(j, 'Black Oil — Sep Test', '1.01', 'NASSER'));
  j = lab(15, { due: 4, tests: ['Black Oil — DL'] }, [pvt('Black Oil — DL', ['1.01'])]); j = schedule(j, 'Black Oil — DL', '1.01', 'NASSER', 1); j = submitWb(j, 'Black Oil — DL', '1.01', 'NASSER');
  jobs.push(leadReturn(j, 'Black Oil — DL', '1.01', 'Liberated GOR at step 4 does not match the gas volume sheet; recheck the meter reading and resubmit.'));
  j = lab(16, { due: 7, samples: ['1.01', '1.02'], tests: ['Black Oil — DL', 'Black Oil — Sep Test'] }, [pvt('Black Oil — DL', ['1.01', '1.02']), pvt('Black Oil — Sep Test', ['1.01'])]);
  j = schedule(j, 'Black Oil — DL', '1.01', 'NASSER', -1); j = start(j, 'Black Oil — DL', '1.01', 'NASSER'); j = schedule(j, 'Black Oil — DL', '1.02', 'NASSER', 3); jobs.push(schedule(j, 'Black Oil — Sep Test', '1.01', 'NASSER', 6));
  j = lab(17, { due: 6, tests: ['Black Oil — DL'] }, [pvt('Black Oil — DL', ['1.01'])]); j = schedule(j, 'Black Oil — DL', '1.01', 'NASSER', 2); jobs.push(submitWb(j, 'Black Oil — DL', '1.01', 'NASSER'));
  j = lab(18, { due: 8, tests: ['Black Oil — DL'] }, [pvt('Black Oil — DL', ['1.01'])]); j = schedule(j, 'Black Oil — DL', '1.01', 'NASSER', 2); j = submitWb(j, 'Black Oil — DL', '1.01', 'NASSER'); jobs.push(leadApprove(j, 'Black Oil — DL', '1.01'));
  j = lab(19, { due: 5, samples: ['1.01', '1.02'], tests: ['Black Oil — DL'] }, [pvt('Black Oil — DL', ['1.01', '1.02'])]);
  j = schedule(j, 'Black Oil — DL', '1.01', 'NASSER', 1); j = submitWb(j, 'Black Oil — DL', '1.01', 'NASSER'); j = leadReturn(j, 'Black Oil — DL', '1.01', 'Flash table uses the wrong base temperature; correct to standard conditions.');
  j = schedule(j, 'Black Oil — DL', '1.02', 'NASSER', 4); jobs.push(start(j, 'Black Oil — DL', '1.02', 'NASSER'));
  j = lab(20, { due: 10, tests: ['Black Oil — DL', 'Others — Water Analysis'] }, [pvt('Black Oil — DL', ['1.01']), chem(['1.01'])]); j = schedule(j, 'Black Oil — DL', '1.01', 'RANJITH', 6); jobs.push(schedule(j, 'Others — Water Analysis', '1.01', 'YAQEEN', 5));
  for (const [seq, due] of [[21, 9], [22, 11], [23, 13], [24, 14], [25, 16], [26, 19]]) { j = lab(seq, { due: due + 2, tests: ['Black Oil — DL'] }, [pvt('Black Oil — DL', ['1.01'])]); jobs.push(schedule(j, 'Black Oil — DL', '1.01', 'NASSER', due)); }
  jobs.push(job(27, { draft: true, due: 25 }));
  return jobs;
}
