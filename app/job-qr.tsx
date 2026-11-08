"use client";
import { useEffect, useState } from "react";
import qrcode from "qrcode-generator";
import type { JobRecord } from "./page";
import { getShare, stopShare, syncShare, type ShareRecord } from "./job-sharing";
import { staticPages, sharingUnavailableMessage, clientSharingEnabled, clientSharingOffMessage } from "./deployment";
/** GitHub Pages has no server or database, so it shows why sharing is off instead of controls that cannot work. */
export function JobQR({ job, canShare = true }: { job: JobRecord; /** Creating, updating or stopping a client link (job coordinators and company-overview holders). */canShare?: boolean }) {
 if (staticPages) return <section className="panel job-qr job-qr-unavailable" aria-labelledby={"share-off-" + job.id}><div><h2 id={"share-off-" + job.id}>Client link</h2><p role="note">{sharingUnavailableMessage}</p></div></section>;
 if (!clientSharingEnabled) return <SharingOff job={job} canShare={canShare} />;
 return <LiveJobQR job={job} canShare={canShare} />;
}
/** Sharing is off: explain why, and let an authorized person withdraw a link created earlier. */
function SharingOff({ job, canShare }: { job: JobRecord; canShare: boolean }) {
 const [existing, setExisting] = useState(false); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
 // Sharing records live in this browser's storage, so they can only be read after mount.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(() => { try { setExisting(!!getShare(job.id)?.enabled); } catch { setExisting(false); } }, [job.id]);
 return <section className="panel job-qr job-qr-unavailable" aria-labelledby={"share-off-" + job.id}><div><h2 id={"share-off-" + job.id}>Client link</h2><p role="note">{clientSharingOffMessage}</p>
  {existing && <><p role="alert" className="share-warning">A client link created earlier is still published and is no longer updated.</p>{canShare && <button type="button" className="outline-button" disabled={busy} onClick={async () => { setBusy(true); try { await stopShare(job.id); setExisting(false); setMessage("Sharing stopped. The old link no longer opens this job."); } catch { setMessage("Sharing could not be stopped. Please retry."); } finally { setBusy(false); } }}>Stop sharing</button>}</>}
  {message && <p role="status">{message}</p>}</div></section>;
}
function LiveJobQR({ job, canShare }: { job: JobRecord; canShare: boolean }) {
 const [share, setShare] = useState<ShareRecord>(); const [audience, setAudience] = useState<"" | ShareRecord["audience"]>(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [url, setUrl] = useState("");
 // Sharing settings live in this browser's storage, so they can only be read after mount.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(() => { try { const saved = getShare(job.id); if (saved?.enabled) { setShare(saved); setAudience(saved.audience); setUrl(window.location.origin + "/track/" + saved.id); } } catch { setError("Sharing settings could not be read on this device."); } }, [job.id]);
 const qr = url ? (() => { const code = qrcode(0, "M"); code.addData(url); code.make(); return code.createDataURL(6, 24); })() : "";
 async function publish() { if (!audience) return; setBusy(true); setError(""); setMessage(""); try { const result = await syncShare(job, audience); if (result) { setShare(result); setUrl(window.location.origin + "/track/" + result.id); setMessage("Shared summary is up to date."); } } catch (error) { setError(error instanceof Error ? error.message : "Sharing failed. Please retry."); } finally { setBusy(false); } }
 return <section className="panel job-qr"><div><h2>Client link</h2><p>Shares the client progress view above. The link shows the latest progress saved from this device.</p>{!canShare && <p role="note">Only job coordinators and company-overview holders can create or change a client link.</p>}<label><span>Who can view this summary?</span><select disabled={!canShare} value={audience} onChange={event => setAudience(event.target.value as typeof audience)}><option value="">Choose an audience</option><option value="signed-in">People with the link who sign in</option>{share?.audience === "link" && <option value="link">Anyone with the link, no sign-in (existing link · not recommended)</option>}</select></label>{share?.audience === "link" && <p role="alert" className="share-warning">This existing link opens without sign-in. Switch it to “People with the link who sign in” and update it.</p>}<p className="track-updated">Sign-in confirms a person’s identity but does not check that they belong to the client. Share the link only with the client’s contacts.</p><p className="track-updated">Only the summary shown above is shared. Update the job from this device to keep the shared copy current.</p><div className="qr-actions"><button type="button" className="primary-button" disabled={!canShare || !audience || busy} onClick={publish}>{busy ? "Saving…" : share ? "Update client link" : "Create client link"}</button>{share && canShare && <button type="button" className="outline-button" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await stopShare(job.id); setShare(undefined); setUrl(""); setMessage("Sharing stopped. The old QR code no longer opens this job."); } catch { setError("Sharing could not be stopped. Please retry."); } finally { setBusy(false); } }}>Stop sharing</button>}</div>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}</div>{url && <div className="qr-code"><img src={qr} width="220" height="220" alt={"QR code for job " + job.id} /><a className="outline-button" href={qr} download={job.id + "-QR.gif"}>Download QR</a><a href={url} target="_blank" rel="noreferrer">Open shared summary</a><button className="text-button" type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage("Summary link copied."); } catch { setError("Could not copy the link. Open the shared summary and copy its address."); } }}>Copy link</button></div>}</section>;
}
