# Laboratory Scope of Work: interactive demo

A separate, clickable demo of the proposed scoping → release → assignment → additional-work flow. It uses one fictional job (`DEMO-26-0412`, "Fictional Energy LLC (demo)"). It is **not** part of the VAPS app, the Sites build or the GitHub Pages deployment, and it never reads or writes VAPS records. Its only browser storage is `vaps-scope-demo-v1` (demo state) and `vaps-scope-demo-v1-role`.

## Run it

```bash
npm run build:scope-demo     # → dist-scope-demo/ and dist-scope-demo/vaps-scope-demo.html (single file, opens offline)
npm run preview:scope-demo   # http://localhost:4174/
```

Files: `scope-demo/` (`model.ts` logic, `main.tsx` UI, `demo.css`), `vite.scope-demo.config.ts`, `tests/scope-demo.test.mjs`.

## Walkthrough (about 5 minutes)

Use the amber **DEMO** bar to switch roles. **Reset demo** replays the job from the start.

1. **Salim → My work → open the job.** One header (job, client, field/well, samples, reservoir P/T). S-01 is open; the other samples are one-line summaries, e.g. `S-01 · Black Oil · PVT + Chemical · Validation · 3 tests · Ready`.
2. Open **S-04**. It shows *Enter the custom fluid name*. Type a name (e.g. *Volatile Oil*). Open **5 Other tests and outsourcing** to see Viscosity outsourced to a fictional provider, coordinated by Ranjith.
3. **Save draft**, then **Review and release**. Each sample shows what goes to Ahmed (PVT), to Al Yaqdhan (Chemical) and what is outsourced. Missing information appears next to the affected sample and blocks release. Release.
4. **Ahmed** → My work shows one entry → opens PVT work. S-02 is absent. S-03 shows *Validation only (Chemical sample)*. In the S-03 Validation card, untick the steps that do not apply and assign the others to different people (Ahmed can pick himself). Keep **Restoration** ticked: saving asks for numeric reservoir P and T, which then become the job's conditions. Assign DL.
5. **Al Yaqdhan** → Chemical work for S-01, S-02 and S-03 (S-03 notes "Validation is with PVT"). Assign SARA to Ahad and Water Analysis to himself.
6. **Team member → Nasser** sees only his own assignments. Open one and **Submit workbook**. As **Ahmed**, **Approve** it (→ Awaiting QC); **Demo: QC approve** marks it complete.
7. **Salim → Additional work → Request additional work.** Add up to five rows. Each row has a sample, a route (PVT, Chemical or both), the work, and a reason. Submit. Each request has its own ID and status. The original released scope stays readable below. Existing assignments and completed work are unchanged.

## What is reused from the app and what is assumed

Reused: catalogue test names and IDs (`app/test-catalogue.ts`), default PVT/Chemical routing, Validation step names and order (`app/lab-work.ts`), roster and lead duties, the six laboratory statuses, Restoration requiring numeric P/T at planning (not at release), the outsourced-test coordinator rule (optional at scoping; otherwise the lead assigns after release), and released scope being locked.

Demo simplifications and assumptions, to confirm before merging:

- Validation is offered from **Opening Pressure through Recombination**, as requested. In the app, Sample Transfer is also a step, used for bottom-hole samples.
- Fluid tests for Water, Chemical, OBM and custom fluids show both methods (Black Oil and Gas Condensate), following the app's behavior for "Other".
- The Validation procedure does not change with the sampling type in this demo.
- Assignment start and due dates, schedule-overlap notices, workbook files, QC reviewer identity, alerts and permissions are not modelled. QC approval is a labelled demo button for the lead.
- Additional requests are submitted by Salim. Who may authorize additional work is still an open item in `WORKFLOW-IMPLEMENTATION.md`.
- A request routed to both teams takes a described test and creates one item for each team.
