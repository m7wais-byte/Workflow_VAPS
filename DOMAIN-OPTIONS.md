# Domain options for workflow.visionaps.com (item 27)

Prepared by Rawand (GitHub: RawandAqel), 28 Nov 2026, for VAPS approval. Every Cloudflare and Microsoft fact below is from the providers' documentation, listed under "Sources".

## The constraint

Your rules for this step:
- The app gets the address **workflow.visionaps.com**, after the pilot passes.
- The existing Microsoft 365 records (MX, SPF, DKIM, DMARC, autodiscover) must not change.
- Only the `workflow` subdomain may be added.

visionaps.com's DNS is not on Cloudflare today. That matters because a Cloudflare Worker can only be given a custom address on a domain that is active in Cloudflare.

## Options compared

| Option | Cost | What the visionaps.com DNS person adds | Touches anything outside `workflow.` | Risk to email |
|---|---|---|---|---|
| **1. Cloudflare for SaaS** (recommended) | Free for up to 100 addresses (then $0.10 each), plus a second domain's yearly registration fee | One CNAME record for `workflow`. Optionally two TXT records under `workflow.` | No | None |
| 2. Partial (CNAME) setup | Business plan: **$200 per month** billed yearly, or $250 monthly | A permanent TXT record `cloudflare-verify.visionaps.com`, plus a CNAME for `workflow` | One new TXT name at the top level | Low: no existing record changes |
| 3. Move all of visionaps.com's DNS to Cloudflare | Free | Change the domain's nameservers, after every record, email included, is recreated at Cloudflare | **Yes: every record moves** | **High:** one missed or wrongly proxied email record breaks mail |
| 4. Delegate only `workflow` to Cloudflare | Enterprise contract only | NS records for `workflow` | No | None |
| 5. Keep the `workers.dev` address | Free | Nothing | No | None |

**Notes**
- **Option 3** breaks your rule that only the subdomain changes, because the whole domain moves to Cloudflare. It needs extra care:
  - DNSSEC must be turned off before the move.
  - Cloudflare's automatic record scan can miss custom names such as the DKIM `selector1._domainkey` and `selector2._domainkey` records.
- **Option 4** is not available below Enterprise.
- **Option 5 is the address for the test site and the pilot**, protected by Cloudflare Access. Cloudflare does not recommend `workers.dev` for production business apps. Its browser check cannot be turned off and blocks some automated clients.

## Recommendation: option 1, Cloudflare for SaaS

**Why**
- It is the only option that is free or cheap and adds records only under `workflow.`, so the Microsoft 365 records are not touched.
- Cloudflare documents a Worker as the origin for these addresses ("Workers as your fallback origin"), with no paid add-on named.
- It includes 100 addresses free. A payment method must be on file, which the Workers Paid plan already needs.

**What it needs**
- **A second domain that VAPS owns, active in the VAPS Cloudflare account** (Free plan, full setup). The app is attached to that domain, and `workflow.visionaps.com` is pointed at it. If VAPS already owns a spare domain, we use that; otherwise one is registered in the VAPS Cloudflare account.
- **The VAPS DNS person adds one record for `workflow`:** a CNAME to the address Cloudflare gives. To avoid even a minute of certificate delay, they can also add two TXT records under `workflow.` that Cloudflare provides. Nothing else on visionaps.com changes.
- **A CAA check first:** run `dig CAA visionaps.com`. If a CAA record exists, it must allow the certificate authorities Cloudflare uses; otherwise no certificate can be issued. If there is no CAA record, nothing is needed.

**Risks and how we handle them**
- **Setup risk:** setup has more steps than the other options. We will set it up and test it end to end on the test deployment before asking the DNS person for the CNAME.
- **Access coverage:** Cloudflare's docs do not say whether a Worker-level Access policy covers traffic that arrives through a SaaS route. If it doesn't, we add an Access application for `workflow.visionaps.com` itself. Zero Trust is free for up to 50 users.
- **The Worker must not also sit on a Workers Custom Domain.** One community report (not official) saw errors in that case. We use a Worker route, as the documentation shows.

**Fallback:** if VAPS prefers not to keep a second domain, option 2 works with only a small, safe addition to visionaps.com, at about $2,400 per year. Option 3 is free but moves the email records, so we do not recommend it under your rule.

## Steps, after the pilot passes

1. **VAPS:**
   - chooses or registers the second domain in the VAPS Cloudflare account;
   - names the DNS person for visionaps.com;
   - runs the CAA check.
2. **We**, in the VAPS Cloudflare account:
   1. Enable Cloudflare for SaaS on the second domain.
   2. Create the fallback origin and the Worker route.
   3. Add the custom hostname `workflow.visionaps.com`.
   4. Prepare the exact records for the DNS person.
3. **The DNS person** adds the CNAME (and the two optional TXT records) under `workflow.`. Nothing else changes.
4. **We:**
   - wait for the certificate to show "Active";
   - set `APP_ORIGIN` to `https://workflow.visionaps.com`, so invitation and email links use it;
   - update the Cloudflare Access application;
   - check sign-in, a job, a file download and an email link.
5. **We switch off the `workers.dev` address** in the deploy settings (`workers_dev = false`), so it does not come back on the next deploy.

**Rollback:** the DNS person removes the CNAME, and the app stays on its `workers.dev` address until the problem is fixed. The email records were never involved.

## What we need from VAPS

1. Approve option 1, or choose option 2.
2. The second domain: an existing one, or approval to register one.
3. Contact with the visionaps.com DNS person after the pilot.

## Sources (checked 28 Nov 2026)

- Workers Custom Domains (need an active zone): https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Workers routes: https://developers.cloudflare.com/workers/configuration/routing/routes/
- workers.dev (not for business-critical production): https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- Zone setups (Free and Pro: full setup only): https://developers.cloudflare.com/dns/zone-setups/
- Partial (CNAME) setup, Business or Enterprise: https://developers.cloudflare.com/dns/zone-setups/partial-setup/
- Subdomain setup, Enterprise only: https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/setup/
- Plan prices: https://www.cloudflare.com/plans/network-cdn/
- Quick scan limits: https://developers.cloudflare.com/dns/zone-setups/reference/dns-quick-scan/
- DNSSEC before a nameserver change: https://developers.cloudflare.com/dns/dnssec/dnssec-active-migration/
- Proxy status (MX and TXT are always DNS-only): https://developers.cloudflare.com/dns/proxy-status/
- Microsoft DKIM with Cloudflare (keep DKIM CNAMEs unproxied): https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dkim-configure
- Cloudflare for SaaS plans: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/
- Cloudflare for SaaS getting started: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/
- Worker as the SaaS origin: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/
- Hostname pre-validation (TXT): https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/pre-validation/
- Certificate validation (TXT): https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/security/certificate-management/issue-and-validate/validate-certificates/txt/
- Access on a SaaS custom hostname: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/security/secure-with-access/
- Access on Workers: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- Zero Trust plans (free up to 50 users): https://www.cloudflare.com/plans/sase-zero-trust/
