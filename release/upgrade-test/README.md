# Upgrade test: current `main` → release candidate

Creates sample records with the **current** build's own API (migrations 0000–0005), persists the local D1/R2, then
starts the **candidate** build on the same database. The candidate must apply only the new migrations and keep every
account, job and file. Local Miniflare only; sample data only; mail and OneDrive stay off.

```bash
git worktree add ../vaps-base origin/main
git worktree add ../vaps-cand <candidate commit>
(cd ../vaps-cand && npm ci) && ln -s "$PWD/../vaps-cand/node_modules" ../vaps-base/node_modules
mkdir -p /tmp/vaps-upgrade && T=$PWD/release/upgrade-test
(cd ../vaps-base && node $T/phaseA.mjs /tmp/vaps-upgrade)
(cd ../vaps-cand && node $T/phaseB.mjs /tmp/vaps-upgrade)
```

`phaseB.mjs` asserts the applied list is exactly `0006_onedrive_pilot.sql` + `0007_mail_outbox.sql`. Update that line if the
candidate's migrations change. Use a fresh state folder for each run.
