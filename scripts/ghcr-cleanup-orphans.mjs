#!/usr/bin/env node
// Identify and (optionally) delete orphaned untagged GHCR container versions.
//
// An "orphan" is an untagged package version whose digest is NOT referenced by
// any currently-tagged manifest list. Multi-arch child manifests of any tagged
// release are preserved automatically.
//
// Env vars:
//   GHCR_TOKEN   (required) PAT with read:packages + delete:packages
//   OWNER        (default Ectropy)
//   PACKAGE      (default ectotrees)
//   OWNER_TYPE   user|org  (default user)
//   DRY_RUN      true|false (default true)

const TOKEN = process.env.GHCR_TOKEN;
const OWNER = process.env.OWNER ?? "Ectropy";
const PACKAGE = process.env.PACKAGE ?? "ectotrees";
const OWNER_TYPE = process.env.OWNER_TYPE ?? "user";
const DRY_RUN = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false";

if (!TOKEN) {
  console.error("GHCR_TOKEN env var is required");
  process.exit(1);
}

const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(",");

const apiBase = OWNER_TYPE === "user"
  ? `https://api.github.com/user/packages/container/${PACKAGE}/versions`
  : `https://api.github.com/orgs/${OWNER}/packages/container/${PACKAGE}/versions`;

async function ghApi(url, init = {}) {
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!r.ok && r.status !== 204) {
    throw new Error(`${init.method ?? "GET"} ${url} -> ${r.status}: ${await r.text()}`);
  }
  return r;
}

async function listAllVersions() {
  const versions = [];
  let url = `${apiBase}?per_page=100`;
  while (url) {
    const r = await ghApi(url);
    versions.push(...await r.json());
    const next = r.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return versions;
}

async function ghcrPullToken() {
  const r = await fetch(
    `https://ghcr.io/token?scope=repository:${OWNER.toLowerCase()}/${PACKAGE}:pull&service=ghcr.io`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  if (!r.ok) throw new Error(`GHCR token fetch failed: ${r.status}`);
  return (await r.json()).token;
}

async function fetchManifest(ghcrTok, digest) {
  const r = await fetch(
    `https://ghcr.io/v2/${OWNER.toLowerCase()}/${PACKAGE}/manifests/${digest}`,
    { headers: { Authorization: `Bearer ${ghcrTok}`, Accept: MANIFEST_ACCEPT } },
  );
  if (!r.ok) return null;
  return r.json();
}

function extractRefs(manifest) {
  const refs = new Set();
  if (Array.isArray(manifest?.manifests)) {
    for (const m of manifest.manifests) {
      if (m.digest) refs.add(m.digest);
    }
  }
  if (manifest?.subject?.digest) refs.add(manifest.subject.digest);
  return refs;
}

async function main() {
  console.log(`Listing all versions of ${OWNER}/${PACKAGE}...`);
  const versions = await listAllVersions();
  const tagged = versions.filter(v => v.metadata?.container?.tags?.length > 0);
  const untagged = versions.filter(v => !v.metadata?.container?.tags?.length);
  console.log(`  total=${versions.length}  tagged=${tagged.length}  untagged=${untagged.length}`);

  console.log(`\nCrawling ${tagged.length} tagged manifests to map references...`);
  const ghcrTok = await ghcrPullToken();
  const referenced = new Set();
  let crawled = 0;
  let failed = 0;
  for (const v of tagged) {
    try {
      const m = await fetchManifest(ghcrTok, v.name);
      if (m) extractRefs(m).forEach(d => referenced.add(d));
      else failed++;
    } catch {
      failed++;
    }
    crawled++;
    if (crawled % 25 === 0) console.log(`  ${crawled}/${tagged.length}`);
  }
  console.log(`  crawled=${crawled} failed=${failed} referenced_digests=${referenced.size}`);

  const orphans = untagged.filter(v => !referenced.has(v.name));
  const protectedCount = untagged.length - orphans.length;
  console.log(`\nResults:`);
  console.log(`  untagged_protected (referenced by a tagged manifest) = ${protectedCount}`);
  console.log(`  untagged_orphans   (safe to delete)                  = ${orphans.length}`);

  if (orphans.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  console.log("\nFirst 10 orphans:");
  for (const o of orphans.slice(0, 10)) {
    console.log(`  id=${o.id} digest=${o.name.slice(0, 19)}... created=${o.created_at}`);
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would delete ${orphans.length} orphans. Set DRY_RUN=false to proceed.`);
    return;
  }

  console.log(`\nDeleting ${orphans.length} orphans...`);
  let ok = 0, fail = 0;
  for (const o of orphans) {
    try {
      await ghApi(`${apiBase}/${o.id}`, { method: "DELETE" });
      ok++;
      if (ok % 25 === 0) console.log(`  ${ok}/${orphans.length}`);
    } catch (e) {
      fail++;
      console.error(`  failed id=${o.id}: ${e.message}`);
    }
  }
  console.log(`\nDone. deleted=${ok} failed=${fail}`);
}

main().catch(e => { console.error(e); process.exit(1); });
