// Build-target helpers shared by the Sites (Vinext/Cloudflare) build and the static GitHub Pages build.
// Vite replaces `import.meta.env` at build time; plain Node/esbuild (tests) leaves it undefined, which means the Sites defaults.
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const env = viteEnv ?? {};
/** True in builds made by Vite (Sites and GitHub Pages). Plain Node test bundles leave `import.meta.env` undefined. */
export const viteBuild = viteEnv !== undefined;

/** True only in the static GitHub Pages build (vite.pages.config.ts), which has no server, D1 database or API routes. */
export const staticPages = env.VITE_VAPS_TARGET === "github-pages";

/** Base path the app is served from: "/" on Sites, "/Workflow_VAPS/" on GitHub Pages. Always ends with "/". */
export const basePath = (env.BASE_URL || "/").replace(/\/?$/, "/");

/**
 * Resolves a stored root-relative asset path (e.g. "/vaps-logo.png", "/client-logos/pdo.png") against the base path.
 * Stored records keep root-relative paths unchanged; data:, blob: and absolute URLs are returned as they are.
 */
export function assetUrl(src: string | undefined): string {
  if (!src) return "";
  if (!src.startsWith("/") || src.startsWith("//") || basePath === "/") return src;
  return src.startsWith(basePath) ? src : basePath + src.slice(1);
}

/**
 * External client sharing stays off until production sign-in, server-side authorization and shared storage exist
 * (see WORKFLOW-IMPLEMENTATION.md, Remaining production blockers). While off, no client link is created or published;
 * stopping an existing link still works so it can be withdrawn.
 */
export const clientSharingEnabled = false;

export const clientSharingOffMessage = "External client sharing is turned off until production sign-in, server-side authorization and shared storage are in place. Use the client progress view above for review, or Print / Save as PDF.";

export const sharingUnavailableMessage = "Client share links and QR codes need the Sites server and its shared database. This GitHub Pages edition runs only in your browser, so sharing is turned off here. Use the Sites edition to share live job progress.";
