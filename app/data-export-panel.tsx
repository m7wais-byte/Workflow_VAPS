"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { exportAllRecords } from "./data-export";

/** Settings overview, administrator only: downloads every record in this browser for the server import. */
export function DataExportPanel({ actorId }: { actorId: string }) {
  const [includeFiles, setIncludeFiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function run() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await exportAllRecords(actorId, includeFiles);
      const url = URL.createObjectURL(result.blob); const a = document.createElement("a"); a.href = url; a.download = result.fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      const c = result.counts;
      setMessage(`Exported ${c.jobs} jobs, ${c.employees} employees, ${c.requests} request book entries and ${includeFiles ? c.files + " uploaded files" : "no uploaded files"}. Nothing in this browser was changed.`);
    } catch (e) { setError(e instanceof Error ? e.message : "The export failed. Nothing was changed."); }
    finally { setBusy(false); }
  }
  return <section className="panel settings-panel" aria-labelledby="data-export-title">
    <div className="panel-heading"><div><h2 id="data-export-title">Export all records</h2><p>Downloads one file with every job, setting, employee, uploaded file and request book entry saved in this browser, for moving the records to the shared server database. Passwords, the sign-in session, client share-link keys and the demo setup are left out. Nothing in this browser is changed or deleted.</p></div></div>
    <p><strong>Keep the file on this computer.</strong> It contains client and operational records: do not email it, upload it or add it to the repository. Run the export on every browser that holds real work.</p>
    <label className="ops-check"><input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} /> Include uploaded files (workbooks, G-sheets, report documents)</label>
    <div><button type="button" className="primary-button" onClick={() => void run()} disabled={busy}><Download size={16} aria-hidden="true" /> {busy ? "Exporting…" : "Export all records"}</button></div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
