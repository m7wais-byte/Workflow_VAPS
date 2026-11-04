// Packs dist-scope-demo/ into one self-contained HTML file (dist-scope-demo/vaps-scope-demo.html) that opens offline.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const dir = resolve(import.meta.dirname, '../dist-scope-demo');
let html = await readFile(resolve(dir, 'index.html'), 'utf8');
for (const [tag, re] of [['script', /<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/], ['style', /<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/]]) {
  const m = html.match(re);
  if (!m) throw Error(`Built ${tag} reference not found in index.html`);
  const code = (await readFile(resolve(dir, m[1]), 'utf8')).replace(/<\/(script|style)/gi, '<\\/$1');
  html = html.replace(m[0], () => (tag === 'script' ? `<script type="module">${code}</script>` : `<style>${code}</style>`));
}
await writeFile(resolve(dir, 'vaps-scope-demo.html'), html);
console.log('Wrote dist-scope-demo/vaps-scope-demo.html');
