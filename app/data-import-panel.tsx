"use client";
/** Settings overview, administrator only (Sites edition): check, then import, a browser export into the shared database. */
import { useState } from "react";
import { Upload } from "lucide-react";
import { api } from "./workspace-sync";

export function DataImportPanel({ onImported }: { onImported: (notice: string) => void }) {
  const [text, setText] = useState(""), [name, setName] = useState("");
  const [report, setReport] = useState(""), [problems, setProblems] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function choose(file?: File) {
    setReport(""); setError(""); if (!file) return;
    setBusy(true);
    try {
      const exportText = await file.text(); setText(exportText); setName(file.name);
      const r = await api<{ report: string; problems: number; fileStorage: boolean }>("/api/admin/import", { method: "POST", json: { action: "plan", exportText } });
      setReport(r.report + (r.fileStorage ? "" : "\nFile storage is not configured on this server: files will be counted, not stored.")); setProblems(r.problems);
    } catch (e) { setError(e instanceof Error ? e.message : "The file could not be checked."); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!window.confirm("Import the new records from " + name + "? Existing records are never overwritten.")) return;
    setBusy(true); setError("");
    try {
      const r = await api<{ added: Record<string, number>; filesWaiting: number }>("/api/admin/import", { method: "POST", json: { action: "apply", exportText: text } });
      const a = r.added;
      onImported(`Imported ${a.job} jobs, ${a.setting} settings, ${a.request} request book entries, ${a.file} files and ${a.archive} archived records.${r.filesWaiting ? ` ${r.filesWaiting} files wait for file storage.` : ""}`);
    } catch (e) { setError(e instanceof Error ? e.message : "The import failed. Nothing was imported."); setBusy(false); }
  }
  return <section className="panel settings-panel" aria-labelledby="data-import-title">
    <div className="panel-heading"><div><h2 id="data-import-title">Import records from a browser export</h2><p>Checks an export file made with “Export all records”, then adds only records the shared database does not hold yet. Existing records are never overwritten; a different copy of the same job is reported as a conflict for you to decide. Every imported record is recorded in the audit log.</p></div></div>
    <label className="outline-button import-choose"><Upload size={16} aria-hidden="true" /> {busy && !report ? "Checking…" : "Choose export file"}<input type="file" accept=".json,application/json" hidden disabled={busy} onChange={(e) => void choose(e.target.files?.[0])} /></label>
    {report && <pre className="import-report" aria-label="Import check">{report}</pre>}
    {report && <div><button type="button" className="primary-button" disabled={busy || problems > 0} onClick={() => void apply()}>{busy ? "Importing…" : "Import new records"}</button></div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
