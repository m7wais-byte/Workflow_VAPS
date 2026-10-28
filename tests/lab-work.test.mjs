import assert from "node:assert/strict";
import test from "node:test";
import { currentProgress, scopeText, reconcileLabScope } from "../app/lab-work.ts";

test("existing jobs without lab records start with pending work", () => {
  assert.deepEqual(currentProgress({}, "Black Oil — DL"), {
    status: "Not started", notes: "", scopeText: "Black Oil — DL",
  });
});

test("saved progress survives serialization and remains test-specific", () => {
  const progress = { status: "Completed", notes: "Reviewed", scopeText: "Black Oil — DL", updatedBy: "employee-1" };
  const job = JSON.parse(JSON.stringify({ labTests: { "Black Oil — DL": progress } }));
  assert.deepEqual(currentProgress(job, "Black Oil — DL"), progress);
  assert.equal(currentProgress(job, "Black Oil — Viscosity").status, "Not started");
});

test("editing additional scope cannot inherit completion from different work", () => {
  const job = { otherTests: "New analysis", labTests: { Other: { scopeText: "Previous analysis", status: "Completed", notes: "Old result" } } };
  assert.equal(scopeText(job, "Other"), "New analysis");
  assert.equal(currentProgress(job, "Other").status, "Not started");
  assert.equal(currentProgress(job, "Other").notes, "");
  assert.equal(job.labTests.Other.notes, "Old result");
});

test("legacy and missing additional work descriptions remain visible", () => {
  assert.equal(scopeText({}, "Legacy test"), "Legacy test");
  assert.equal(scopeText({}, "Other"), "Other — details not specified");
});

test("scope updates retain unchanged work and reset removed or replaced tests", () => {
  const completed = { status: "Completed", notes: "Done", scopeText: "DL" };
  const updated = reconcileLabScope({ requiredTests: ["DL", "Other"], otherTests: "New work", labTests: {
    DL: completed, Viscosity: { ...completed, scopeText: "Viscosity" }, Other: { ...completed, scopeText: "Old work" },
  } });
  assert.deepEqual(updated.labTests, { DL: completed });
  const readded = { ...updated, requiredTests: ["DL", "Viscosity"] };
  assert.equal(currentProgress(readded, "Viscosity").status, "Not started");
  assert.equal(currentProgress(updated, "Other").status, "Not started");
});
