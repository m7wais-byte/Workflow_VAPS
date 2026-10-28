"use client";
import { useState } from "react";

const logos: Record<string, string> = {
  "petroleum development oman": "pdo.png", pdo: "pdo.png",
  oq: "oq.svg", oxy: "oxy.png", occidental: "oxy.png",
  cced: "cced.svg", "cc energy development": "cced.svg",
  daleel: "daleel.png", "daleel petroleum": "daleel.png",
};
export function clientLogoSource(client: { name: string; shortName: string; logo?: string }) {
  if (client.logo !== undefined) return client.logo;
  const asset = logos[client.name.trim().toLowerCase()] || logos[client.shortName.trim().toLowerCase()];
  return asset ? "/client-logos/" + asset : "";
}
export function ClientLogo({ client }: { client: { name: string; shortName: string; logo?: string } }) {
  const src = clientLogoSource(client);
  const [failed, setFailed] = useState("");
  return <span className="client-brand" aria-hidden="true">{src && failed !== src
    // Local assets and uploaded data URLs use the same fixed, contained image frame.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" onError={() => setFailed(src)} />
    : <span className="client-initials">{(client.shortName || client.name).slice(0, 2).toUpperCase()}</span>}</span>;
}
