# GitHub Pages edition

The workflow app is published in two separate ways:

| | Sites edition (unchanged) | GitHub Pages edition |
|---|---|---|
| Build | `npm run build` (Vinext + Cloudflare, `vite.config.ts`) | `npm run build:pages` (static Vite SPA, `vite.pages.config.ts`) → `dist-pages/` |
| URL | Existing Sites website | https://m7wais-byte.github.io/Workflow_VAPS/ |
| Records | Browser storage on the Sites domain | Browser storage on `m7wais-byte.github.io` |
| D1 database / API | Yes (`/api/job-summary`) | No |
| Client share links and QR codes (`/track/…`) | Yes | **Off** — the share panel explains why |

Everything else — jobs, roles and demo profiles, approvals, Laboratory Scope, sampling review, Sampling and Analysis Report preview and Save as PDF / Print, Settings, inventory and uploaded workbooks — runs in the browser and works the same in both editions.

## How it is built and deployed

- `github-pages/index.html` and `github-pages/main.tsx` mount the same client app (`app/page.tsx`) without the Next/Vinext server layer. The folder is not called `pages/` because Vinext would treat that as a Pages Router.
- `app/deployment.ts` sets the build target and base path. Stored logo paths such as `/vaps-logo.png` and `/client-logos/pdo.png` are kept as they are in records and resolved under `/Workflow_VAPS/` when they are displayed or printed.
- Navigation uses `#` routes, so refreshing any view works on GitHub Pages. Unknown paths, such as old `/track/…` links, are sent to the workspace by `404.html`.
- `.github/workflows/pages.yml` runs on every push to `main` (and manually): type check, static build, tests, then deploys with the official `configure-pages`, `upload-pages-artifact` and `deploy-pages` actions. Only `dist-pages/` is uploaded: compiled code, logos and icons. No records, workbooks, credentials or browser-storage exports are part of the build.

Local preview under the same base path:

```bash
npm run build:pages
npm run preview:pages   # http://localhost:4173/Workflow_VAPS/
```

## Moving existing browser records to the Pages edition

Browser storage belongs to one website address, so records saved on the Sites website do **not** appear on GitHub Pages, and nothing is copied automatically. The app has no export/import screen yet. If you want to carry records over, do it manually in the browser that holds them:

1. **Copy from the Sites website.** Sign in there, open the browser's developer tools (F12 → Console) and run:

   ```js
   copy(JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith("vaps-") && !["vaps-job-summary-links-v1", "vaps-demo-session-v1"].includes(k)).map(k => [k, localStorage.getItem(k)]))))
   ```

   This copies the VAPS records to the clipboard. Paste them into a file kept on your own computer only. Do not commit, upload or email it: it contains operational records. Share-link keys and the sign-in session are deliberately left out.

2. **Paste into the Pages edition (first use only).** Open https://m7wais-byte.github.io/Workflow_VAPS/ in the same browser *before* creating any records there, open the Console, and run (replace `PASTE_HERE` with the copied text, kept inside the backticks):

   ```js
   const data = JSON.parse(String.raw`PASTE_HERE`);
   if (Object.keys(localStorage).some(k => k.startsWith("vaps-"))) throw new Error("This site already has VAPS records. Nothing was changed.");
   for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
   location.reload();
   ```

   The check stops the import if the Pages edition already holds VAPS records, so nothing is overwritten.

3. **Uploaded workbooks are not included.** Files attached to jobs are stored separately (IndexedDB). After the transfer their names and details still appear, but downloading them on Pages shows "not available in this browser". Download any files you need from the Sites website first and keep them locally.

4. **Shared client links stay on Sites.** Existing QR codes and `/track/…` links keep working from the Sites website only.

Note: every GitHub Pages site under `m7wais-byte.github.io` (for example PVT Nexus) shares the same browser-storage area. VAPS keys all start with `vaps-`, so they do not collide, but treat that storage as shared between your Pages projects.
