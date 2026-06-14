# Third-party data attributions

The blocklist data layer (`src/shared/blocklist/`) is compiled at build time from
the upstream feeds below by `scripts/compile-blocklists.mjs`. Only license-clean,
redistributable feeds are bundled. The bundle is **data, not code** — it is parsed
by a strict schema whose only expressible action is "block a domain"
(`src/shared/blocklist/bundleSchema.ts`); it is never `eval`'d.

## Bundled feeds

### HaGeZi DNS Blocklists — GPL-3.0
- Source: https://github.com/hagezi/dns-blocklists
- License: GNU General Public License v3.0
- Used lists: `pro.mini` (tracker), `tif.mini` (threat-intel: malware/phishing/C2),
  `nrd7` (newly-registered domains, escalation tier).
- Obligations honored: attribution here; the compiled bundle is redistributed as
  data under the upstream terms. Do not strip this notice.

### Phishing.Database (mitchellkrogza) — MIT
- Source: https://github.com/Phishing-Database/Phishing.Database
- License: MIT
- Used list: `phishing-domains-ACTIVE.txt`.
- Obligations honored: MIT requires only this attribution notice be preserved.

## Build tooling

### @adguard/hostlist-compiler — (dev dependency)
- Source: https://github.com/AdguardTeam/HostlistCompiler
- Used at build time only to fetch, normalize, compress, and de-duplicate the
  feeds above. Not shipped in the extension.

## Not bundled (deliberately)

abuse.ch ThreatFox/URLhaus and OpenPhish are **not** redistributed — their terms
restrict redistribution and/or require a per-user auth key. See
`docs/RESEARCH_BLOCKLIST_DATA_LAYER.md` §2 for the full per-feed license verdict.
