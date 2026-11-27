// zacaddons.com - the site's own small server (a Cloudflare Worker).
//
// What it does
//   /api/report      takes a report or suggestion from the site, keeps it for the
//                    admin panel's inbox and passes it on to Discord. The Discord
//                    webhook address lives here as an encrypted secret, so it is
//                    no longer in the site's public files.
//   /api/hit         counts a page view or a download click. No cookies; the
//                    visitor's address is never stored (only a salted one-way
//                    fingerprint, kept for one day, to count unique visitors).
//   /admin/api/...   everything the admin panel (zacaddons.com/admin/) does.
//
// Sign-in: a password plus a six-digit code from an authenticator app. The
// password is stored only as a slow one-way hash (PBKDF2); the authenticator
// key is stored encrypted with a key made from the password, so the database
// alone opens nothing. Sessions are random tokens kept only as hashes, in a
// cookie scripts cannot read. First set-up and "I lost my phone" both need a
// code that is posted to the Discord channel the webhook points at.
//
// Cloudflare settings this needs (Workers & Pages > this worker > Settings):
//   Bindings   D1 database  -> name DB
//              KV namespace -> name FILES        (screenshots)
//   Secrets    DISCORD_WEBHOOK   where reports go (and set-up codes)
//              IDEAS_WEBHOOK     optional: suggestions to another channel
//              GITHUB_TOKEN      fine-grained token: lets the panel edit the
//                                site, make issues and read release details
//   Routes     zacaddons.com/api/*  and  zacaddons.com/admin/api/*
//
// The tables are made the first time the worker runs.

const SITE = "https://zacaddons.com";
const ORIGINS = [SITE, "https://www.zacaddons.com"];
const OWNER = "Zac175";
const SITE_REPO = "Zac175.github.io";
const MAX_REPORT = 9 * 1024 * 1024;
const SESSION_DAYS = 7;
const PBKDF2_ITER = 100000;

// the addons, for the release helper and download counts
const ADDONS = [
  { id: "zacui", name: "ZacUI", repo: "ZacUI", toc: "Zacui/Zacui.toc", curse: "https://www.curseforge.com/wow/addons/zacui" },
  { id: "readycheck", name: "Readycheck", repo: "Readycheck", toc: "Readycheck/Readycheck.toc", curse: "https://www.curseforge.com/wow/addons/readycheck" },
  { id: "defaultframes", name: "DefaultFrames", repo: "OldRaidFrames", toc: "OldRaidFrames.toc", curse: "https://www.curseforge.com/wow/addons/defaultframes" },
  { id: "stacked", name: "Stacked Raid Groups", repo: "StackedRaidGroups", toc: "StackedRaidGroups.toc", curse: "https://www.curseforge.com/wow/addons/stacked-raid-groups" },
  { id: "wowtiler", name: "WowTiler", repo: "WowTiler", kind: "app" },
  { id: "multilauncher", name: "MultiLauncher", repo: "MultiLauncher", kind: "app", feed: "repo" },
];

// ------------------------------------------------------------------ helpers
const enc = new TextEncoder();
function json(data, status, extra) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }, extra || {}),
  });
}
function fail(status, message) { return json({ ok: false, error: message }, status); }
function now() { return Date.now(); }
function day(t) { return new Date(t || now()).toISOString().slice(0, 10); }
function hex(buf) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function b64(buf) { let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); }
function unb64(s) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }
async function sha256(s) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
function cut(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n) : s; }
function same(a, b) { // constant-time string compare
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
function ipOf(req) { return req.headers.get("CF-Connecting-IP") || "0.0.0.0"; }
function countryOf(req) { return (req.cf && req.cf.country) || ""; }

// ------------------------------------------------------------------ database
let ready = false;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, created INTEGER, kind TEXT, addon TEXT, version TEXT, game TEXT,
     title TEXT, what TEXT, fields TEXT, contact TEXT, text TEXT, shot INTEGER DEFAULT 0, status TEXT DEFAULT 'new',
     note TEXT DEFAULT '', issue TEXT DEFAULT '', discord INTEGER DEFAULT 0, country TEXT DEFAULT '', updated INTEGER)`,
  `CREATE INDEX IF NOT EXISTS reports_created ON reports (created)`,
  `CREATE TABLE IF NOT EXISTS hits (day TEXT, kind TEXT, key TEXT, n INTEGER, PRIMARY KEY (day, kind, key))`,
  `CREATE TABLE IF NOT EXISTS uniq (day TEXT, h TEXT, PRIMARY KEY (day, h))`,
  `CREATE TABLE IF NOT EXISTS sessions (h TEXT PRIMARY KEY, created INTEGER, expires INTEGER, seen INTEGER, country TEXT, agent TEXT)`,
  `CREATE TABLE IF NOT EXISTS authlog (ts INTEGER, ok INTEGER, what TEXT, country TEXT, iph TEXT)`,
  `CREATE TABLE IF NOT EXISTS limits (k TEXT, ts INTEGER)`,
  `CREATE INDEX IF NOT EXISTS limits_k ON limits (k, ts)`,
];
async function setup(env) {
  if (ready) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  ready = true;
}
async function kvGet(env, k) { const r = await env.DB.prepare("SELECT v FROM kv WHERE k = ?").bind(k).first(); return r ? r.v : null; }
async function kvSet(env, k, v) { await env.DB.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v).run(); }
async function kvDel(env, k) { await env.DB.prepare("DELETE FROM kv WHERE k = ?").bind(k).run(); }

// a secret salt for one-way fingerprints, made once
async function salt(env) {
  let s = await kvGet(env, "salt");
  if (!s) { s = hex(rand(32)); await kvSet(env, "salt", s); }
  return s;
}
async function ipHash(env, req) { return (await sha256((await salt(env)) + "|ip|" + ipOf(req))).slice(0, 32); }

// true when this key has had fewer than `max` events in the last `secs`; records one
async function allow(env, key, max, secs) {
  const since = now() - secs * 1000;
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM limits WHERE k = ? AND ts > ?").bind(key, since).first();
  if (r && r.n >= max) return false;
  await env.DB.prepare("INSERT INTO limits (k, ts) VALUES (?, ?)").bind(key, now()).run();
  if (Math.random() < 0.05) await env.DB.prepare("DELETE FROM limits WHERE ts < ?").bind(now() - 86400000).run();
  return true;
}

// ------------------------------------------------------------------ discord
async function discord(env, content, kind) {
  const hook = kind === "idea" && env.IDEAS_WEBHOOK ? env.IDEAS_WEBHOOK : env.DISCORD_WEBHOOK;
  if (!hook) return false;
  try {
    const r = await fetch(hook, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "zacaddons.com", content: cut(content, 1900), allowed_mentions: { parse: [] } }),
    });
    return r.ok;
  } catch (e) { return false; }
}

// ------------------------------------------------------------------ crypto for sign-in
async function pbkdf2(password, saltBytes, bits) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: PBKDF2_ITER }, key, bits || 256);
}
async function aesKey(password, saltBytes) {
  const raw = await pbkdf2(password + "|totp", saltBytes, 256);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(password, text) {
  const s = rand(16), iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(password, s), enc.encode(text));
  return [b64(s), b64(iv), b64(ct)].join(".");
}
async function unseal(password, blob) {
  const [s, iv, ct] = blob.split(".").map(unb64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await aesKey(password, s), ct);
  return new TextDecoder().decode(pt);
}
async function hashPassword(password) {
  const s = rand(16);
  return "pbkdf2$" + PBKDF2_ITER + "$" + b64(s) + "$" + b64(await pbkdf2(password, s));
}
async function checkPassword(password, stored) {
  const p = String(stored || "").split("$");
  if (p.length !== 4) { await pbkdf2(password, rand(16)); return false; }
  return same(b64(await pbkdf2(password, unb64(p[2]))), p[3]);
}

// TOTP (RFC 6238): 30 s steps, 6 digits, SHA-1, what every authenticator app does
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32encode(bytes) {
  let bits = 0, val = 0, out = "";
  for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function b32decode(s) {
  s = s.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0, val = 0; const out = [];
  for (const c of s) { const i = B32.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
async function totpAt(secret, step) {
  const key = await crypto.subtle.importKey("raw", b32decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8); const v = new DataView(msg);
  v.setUint32(0, Math.floor(step / 4294967296)); v.setUint32(4, step >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, "0");
}
// the step the code matched, or -1; a step already used is refused
async function totpCheck(secret, code, lastStep) {
  code = String(code || "").replace(/\D/g, "");
  if (code.length !== 6) return -1;
  const t = Math.floor(now() / 30000);
  for (const d of [0, -1, 1]) {
    const st = t + d;
    if (st <= lastStep) continue;
    if (same(await totpAt(secret, st), code)) return st;
  }
  return -1;
}

// ------------------------------------------------------------------ sessions
function cookieOf(req, name) {
  const c = req.headers.get("Cookie") || "";
  for (const part of c.split(/;\s*/)) { const i = part.indexOf("="); if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1); }
  return "";
}
const COOKIE = "__Host-zadmin";
function sessionCookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}
async function session(env, req) {
  const t = cookieOf(req, COOKIE);
  if (!/^[a-f0-9]{64}$/.test(t)) return null;
  const h = await sha256(t);
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE h = ?").bind(h).first();
  if (!s || s.expires < now()) return null;
  if (now() - (s.seen || 0) > 60000) await env.DB.prepare("UPDATE sessions SET seen = ? WHERE h = ?").bind(now(), h).run();
  return s;
}
async function newSession(env, req) {
  const token = hex(rand(32));
  await env.DB.prepare("INSERT INTO sessions (h, created, expires, seen, country, agent) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(await sha256(token), now(), now() + SESSION_DAYS * 86400000, now(), countryOf(req), cut(req.headers.get("User-Agent"), 200)).run();
  return token;
}
async function log(env, req, ok, what) {
  await env.DB.prepare("INSERT INTO authlog (ts, ok, what, country, iph) VALUES (?, ?, ?, ?, ?)")
    .bind(now(), ok ? 1 : 0, what, countryOf(req), (await ipHash(env, req)).slice(0, 8)).run();
}

// ------------------------------------------------------------------ public: reports
async function report(req, env, ctx) {
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > MAX_REPORT) return fail(413, "too big");
  if (!(await allow(env, "report:" + (await ipHash(env, req)), 4, 600))) return fail(429, "too many reports");
  let form;
  try { form = await req.formData(); } catch (e) { return fail(400, "not a form"); }
  let payload;
  try { payload = JSON.parse(form.get("payload_json") || ""); } catch (e) { return fail(400, "no report"); }
  let meta = {};
  try { meta = JSON.parse(form.get("meta") || "{}") || {}; } catch (e) { meta = {}; }
  const embed = (payload.embeds && payload.embeds[0]) || {};
  const kind = /^(bug|idea|question)$/.test(meta.kind) ? meta.kind : (new URL(req.url).searchParams.get("kind") === "idea" ? "idea" : "bug");
  const id = cut(String(meta.ref || (embed.footer && embed.footer.text) || "R-" + hex(rand(4))).replace(/[^\w-]/g, ""), 40) || "R-" + hex(rand(4));

  // the files: a text copy of the report and maybe a screenshot
  const files = [];
  let text = "", shot = null;
  for (const [k, v] of form.entries()) {
    if (!/^files\[\d+\]$/.test(k) || typeof v === "string") continue;
    files.push([k, v]);
    if (/^image\//.test(v.type) && !shot) shot = v;
    else if (/text\/plain/.test(v.type) && !text) text = cut(await v.text(), 60000);
  }

  // keep it (a report is never lost if Discord is down)
  let kept = false;
  try {
    const exists = await env.DB.prepare("SELECT id FROM reports WHERE id = ?").bind(id).first();
    const rid = exists ? id + "-" + hex(rand(2)) : id;
    if (shot && env.FILES) { await env.FILES.put("shot:" + rid, await shot.arrayBuffer(), { metadata: { type: shot.type } }); }
    await env.DB.prepare(`INSERT INTO reports (id, created, kind, addon, version, game, title, what, fields, contact, text, shot, country, updated)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(rid, now(), kind, cut(meta.addon, 40), cut(meta.version, 40), cut(meta.game, 40), cut(embed.title, 300),
        cut(meta.what || embed.description, 6000), JSON.stringify((embed.fields || []).slice(0, 25)), cut(meta.contact, 100), text,
        shot && env.FILES ? 1 : 0, countryOf(req), now()).run();
    kept = rid;
  } catch (e) { kept = false; }

  // pass it on to Discord, as the site used to do itself
  let sent = false, status = 0;
  const hook = kind === "idea" && env.IDEAS_WEBHOOK ? env.IDEAS_WEBHOOK : env.DISCORD_WEBHOOK;
  if (hook) {
    const fd = new FormData();
    fd.append("payload_json", JSON.stringify(payload));
    for (const [k, v] of files) fd.append(k, v, v.name);
    try {
      const r = await fetch(hook + (hook.includes("?") ? "&" : "?") + "wait=true", { method: "POST", body: fd });
      status = r.status; sent = r.ok;
    } catch (e) { sent = false; }
    if (kept) ctx.waitUntil(env.DB.prepare("UPDATE reports SET discord = ? WHERE id = ?").bind(sent ? 1 : 0, kept).run());
  }
  if (!kept && !sent) return fail(status === 429 ? 429 : 502, "could not keep or send the report");
  return json({ ok: true, ref: kept || id, discord: sent });
}

// ------------------------------------------------------------------ public: counting
async function hit(req, env) {
  const ua = req.headers.get("User-Agent") || "";
  if (/bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(ua)) return new Response(null, { status: 204 });
  let b = {};
  try { b = JSON.parse(await req.text()) || {}; } catch (e) { return new Response(null, { status: 204 }); }
  const d = day();
  const rows = [];
  const add = (kind, key) => rows.push(env.DB.prepare("INSERT INTO hits (day, kind, key, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1").bind(d, kind, cut(key, 80)));
  if (b.t === "view") {
    add("view", String(b.p || "/").replace(/[^\w/#?=&.-]/g, "").replace(/[?&](v|game|addon)=[^&]*/g, "") || "/");
    const from = String(b.r || "").toLowerCase().replace(/^www\./, "");
    if (from && !/zacaddons\.com$/.test(from)) add("from", from);
    add("country", countryOf(req) || "??");
    const uh = (await sha256((await salt(env)) + "|" + d + "|" + ipOf(req) + "|" + ua)).slice(0, 24);
    const r = await env.DB.prepare("INSERT OR IGNORE INTO uniq (day, h) VALUES (?, ?)").bind(d, uh).run();
    if (r.meta && r.meta.changes) add("visitors", "all");
  } else if (b.t === "download" && /^[\w-]{1,40}$/.test(b.a || "")) {
    add("download", b.a + (b.w ? ":" + String(b.w).replace(/\W/g, "") : ""));
  } else if (b.t === "sent" && /^(bug|idea|question)$/.test(b.k || "")) {
    add("sent", b.k);
  } else return new Response(null, { status: 204 });
  await env.DB.batch(rows);
  if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM uniq WHERE day < ?").bind(day(now() - 3 * 86400000)).run();
  return new Response(null, { status: 204 });
}

// ------------------------------------------------------------------ github
async function gh(env, path, opt) {
  opt = opt || {};
  const headers = { "Accept": "application/vnd.github+json", "User-Agent": "zacaddons-admin", "X-GitHub-Api-Version": "2022-11-28" };
  if (env.GITHUB_TOKEN) headers.Authorization = "Bearer " + env.GITHUB_TOKEN;
  if (opt.body) headers["Content-Type"] = "application/json";
  const r = await fetch((env.GH_API || "https://api.github.com") + path, { method: opt.method || "GET", headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
  let data = null;
  try { data = await r.json(); } catch (e) { data = null; }
  return { ok: r.ok, status: r.status, data };
}
async function raw(env, path) {
  const r = await fetch((env.GH_RAW || "https://raw.githubusercontent.com") + "/" + OWNER + "/" + path, { headers: { "User-Agent": "zacaddons-admin" } });
  return r.ok ? r.text() : "";
}
function utf8b64(s) { return b64(enc.encode(s)); }
function fromb64(s) { return new TextDecoder().decode(unb64(String(s || "").replace(/\s/g, ""))); }

async function releases(env) {
  const out = [];
  let snap = {};
  try {
    const t = await (await fetch((env.SITE_URL || SITE) + "/data/changelog.js?t=" + now())).text();
    snap = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)).addons || {};
  } catch (e) { snap = {}; }
  await Promise.all(ADDONS.map(async (a) => {
    const row = { id: a.id, name: a.name, repo: a.repo, curse: a.curse || "", problems: [] };
    const [rel, runs, issues] = await Promise.all([
      a.feed === "repo" ? Promise.resolve(null) : gh(env, `/repos/${OWNER}/${a.repo}/releases?per_page=100`),
      gh(env, `/repos/${OWNER}/${a.repo}/actions/runs?per_page=1`),
      gh(env, `/repos/${OWNER}/${a.repo}/issues?state=open&per_page=100`),
    ]);
    if (rel && rel.ok && Array.isArray(rel.data)) {
      const list = rel.data.filter((r) => !r.draft);
      const top = list[0];
      row.release = top ? { tag: top.tag_name, date: top.published_at, url: top.html_url, assets: (top.assets || []).map((x) => x.name) } : null;
      row.downloads = list.reduce((n, r) => n + (r.assets || []).reduce((m, x) => m + (x.download_count || 0), 0), 0);
      if (!top) row.problems.push("No GitHub release yet.");
      else if (!(top.assets || []).length) row.problems.push("The newest release has no files attached.");
    } else if (rel) row.problems.push("Could not read the releases (" + rel.status + ").");
    if (a.toc) {
      const toc = await raw(env, `${a.repo}/main/${a.toc}`);
      const m = toc.match(/^## Version:\s*(\S+)/m);
      row.main = m ? m[1] : "";
      if (row.main && row.release && row.release.tag.replace(/^v/, "") !== row.main) row.problems.push(`main says ${row.main} but the newest release is ${row.release.tag}: the release run may have failed or is still going.`);
    } else if (a.feed === "repo") {
      const log = await raw(env, `${a.repo}/main/CHANGELOG.md`);
      const m = log.match(/^#\s*\S+\s+(\d[\w.]*)/m);
      row.main = m ? m[1] : "";
    }
    if (runs.ok && runs.data && runs.data.workflow_runs && runs.data.workflow_runs[0]) {
      const r = runs.data.workflow_runs[0];
      row.run = { name: r.name, status: r.status, conclusion: r.conclusion, date: r.created_at, url: r.html_url };
      if (r.conclusion && r.conclusion !== "success" && r.conclusion !== "skipped") row.problems.push("The last GitHub Actions run ended: " + r.conclusion + ".");
    }
    if (issues.ok && Array.isArray(issues.data)) {
      const real = issues.data.filter((i) => !i.pull_request);
      row.issues = real.length;
      row.ideas = real.filter((i) => (i.labels || []).some((l) => l.name === "idea")).length;
      row.known = real.filter((i) => (i.labels || []).some((l) => l.name === "known")).length;
    }
    const v = (row.release && row.release.tag.replace(/^v/, "")) || row.main;
    row.snapshot = snap[a.id] ? snap[a.id].current : "";
    if (v && a.kind !== "app" && row.snapshot && row.snapshot !== v) row.problems.push("The site's built-in history stops at " + row.snapshot + ": " + v + " shows without its per-game marks until it is rebuilt.");
    out.push(row);
  }));
  out.sort((x, y) => ADDONS.findIndex((a) => a.id === x.id) - ADDONS.findIndex((a) => a.id === y.id));
  return { addons: out, token: !!env.GITHUB_TOKEN };
}

// ------------------------------------------------------------------ admin: stats
async function stats(env, days) {
  days = Math.max(1, Math.min(365, days || 30));
  const since = day(now() - (days - 1) * 86400000);
  const rows = (await env.DB.prepare("SELECT day, kind, key, n FROM hits WHERE day >= ? ORDER BY day").bind(since).all()).results || [];
  const byDay = {}, top = { view: {}, from: {}, country: {}, download: {}, sent: {} };
  for (let i = 0; i < days; i++) byDay[day(now() - (days - 1 - i) * 86400000)] = { views: 0, visitors: 0, downloads: 0 };
  for (const r of rows) {
    const d = byDay[r.day] || (byDay[r.day] = { views: 0, visitors: 0, downloads: 0 });
    if (r.kind === "view") d.views += r.n;
    if (r.kind === "visitors") d.visitors += r.n;
    if (r.kind === "download") d.downloads += r.n;
    if (top[r.kind]) top[r.kind][r.key] = (top[r.kind][r.key] || 0) + r.n;
  }
  const sort = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 25);
  const reports = (await env.DB.prepare("SELECT kind, COUNT(*) AS n FROM reports WHERE created >= ? GROUP BY kind").bind(now() - days * 86400000).all()).results || [];
  return { days: Object.entries(byDay).map(([d, v]) => Object.assign({ day: d }, v)), pages: sort(top.view), from: sort(top.from), countries: sort(top.country), downloads: sort(top.download), sent: sort(top.sent), reports };
}

// ------------------------------------------------------------------ admin: sign-in
async function adminState(env, req) {
  const s = await session(env, req);
  const hasPw = !!(await kvGet(env, "pw"));
  return json({ ok: true, setUp: hasPw, signedIn: !!s, discord: !!env.DISCORD_WEBHOOK, github: !!env.GITHUB_TOKEN, files: !!env.FILES });
}

// set-up and reset: a code goes to Discord; whoever can read that channel is the owner
async function askCode(env, req, why) {
  if (!env.DISCORD_WEBHOOK) return fail(400, "The Discord webhook is not set on the worker yet, so there is nowhere to send the code.");
  if (!(await allow(env, "code", 3, 3600))) return fail(429, "Three codes were sent in the last hour. Wait a while and try again.");
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await kvSet(env, "setupcode", JSON.stringify({ h: await sha256(code), until: now() + 15 * 60000, tries: 0 }));
  const ok = await discord(env, `Admin panel ${why} code: **${code}**\nIt works for 15 minutes. If you did not ask for it, ignore it; nobody gets in without it. (Asked from ${countryOf(req) || "somewhere"}.)`);
  await log(env, req, true, why + " code sent");
  return ok ? json({ ok: true }) : fail(502, "Discord did not take the message. Check the webhook.");
}
async function useCode(env, code, consume) {
  const raw = await kvGet(env, "setupcode");
  if (!raw) return false;
  const c = JSON.parse(raw);
  if (c.until < now() || c.tries >= 5) { await kvDel(env, "setupcode"); return false; }
  const good = same(await sha256(String(code || "").replace(/\D/g, "")), c.h);
  if (!good) { c.tries++; await kvSet(env, "setupcode", JSON.stringify(c)); return false; }
  if (consume) await kvDel(env, "setupcode");
  return true;
}
async function setupStart(env, req, body) {
  if (!(await useCode(env, body.code, false))) { await log(env, req, false, "set-up code wrong"); return fail(403, "That code is wrong or too old. Ask for a new one."); }
  const secret = b32encode(rand(20));
  await kvSet(env, "pendingtotp", JSON.stringify({ s: secret, until: now() + 15 * 60000 }));
  return json({ ok: true, secret, uri: `otpauth://totp/zacaddons.com:admin?secret=${secret}&issuer=zacaddons.com&digits=6&period=30` });
}
async function setupFinish(env, req, body) {
  const pw = String(body.password || "");
  if (pw.length < 12) return fail(400, "Use at least 12 characters for the password.");
  const pend = JSON.parse((await kvGet(env, "pendingtotp")) || "null");
  if (!pend || pend.until < now()) return fail(400, "That set-up took too long. Start again.");
  const step = await totpCheck(pend.s, body.totp, -1);
  if (step < 0) return fail(400, "The six-digit code from the app did not match. Check the phone's clock, and type the code that is showing now.");
  if (!(await useCode(env, body.code, true))) return fail(403, "That Discord code is wrong or too old. Start again.");
  await kvSet(env, "pw", await hashPassword(pw));
  await kvSet(env, "totp", await seal(pw, pend.s));
  await kvSet(env, "totpstep", String(step));
  await kvDel(env, "pendingtotp");
  await env.DB.prepare("DELETE FROM sessions").run();
  await log(env, req, true, "password and app set");
  await discord(env, "The admin panel's password and authenticator app were just set" + (countryOf(req) ? " (from " + countryOf(req) + ")" : "") + ". Every other sign-in was ended.");
  const token = await newSession(env, req);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, SESSION_DAYS * 86400) });
}
async function login(env, req, body) {
  const iph = await ipHash(env, req);
  if (!(await allow(env, "login:" + iph, 5, 900))) return fail(429, "Too many tries from here. Wait 15 minutes.");
  if (!(await allow(env, "login:all", 30, 3600))) {
    await discord(env, "Sign-ins to the admin panel are paused for an hour: 30 tries in the last hour.");
    return fail(429, "Sign-in is paused for a while after many tries. Wait an hour.");
  }
  const pw = String(body.password || "");
  const stored = await kvGet(env, "pw");
  const pwOk = stored ? await checkPassword(pw, stored) : false;
  let step = -1;
  if (pwOk) {
    try {
      const secret = await unseal(pw, await kvGet(env, "totp"));
      step = await totpCheck(secret, body.totp, Number((await kvGet(env, "totpstep")) || -1));
    } catch (e) { step = -1; }
  }
  if (!pwOk || step < 0) {
    await log(env, req, false, pwOk ? "app code wrong" : "password wrong");
    return fail(403, "That password or code is not right.");
  }
  await kvSet(env, "totpstep", String(step));
  await log(env, req, true, "signed in");
  const token = await newSession(env, req);
  await discord(env, "New sign-in to the admin panel" + (countryOf(req) ? " from " + countryOf(req) : "") + ". If this was not you, open the panel and press \"Sign out everywhere\", then change the password.");
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, SESSION_DAYS * 86400) });
}
async function changePassword(env, req, body) {
  const pw = String(body.password || ""), np = String(body.newPassword || "");
  if (np.length < 12) return fail(400, "Use at least 12 characters for the new password.");
  if (!(await checkPassword(pw, await kvGet(env, "pw")))) { await log(env, req, false, "change password: old one wrong"); return fail(403, "The current password is not right."); }
  const secret = await unseal(pw, await kvGet(env, "totp"));
  await kvSet(env, "pw", await hashPassword(np));
  await kvSet(env, "totp", await seal(np, secret));
  await log(env, req, true, "password changed");
  await discord(env, "The admin panel's password was changed.");
  return json({ ok: true });
}

// ------------------------------------------------------------------ admin router
async function admin(req, env, ctx, path) {
  const method = req.method;
  // writes must come from the panel itself
  if (method !== "GET") {
    const origin = req.headers.get("Origin") || "";
    const allowed = env.DEV_ORIGIN ? ORIGINS.concat([env.DEV_ORIGIN]) : ORIGINS;
    if (!allowed.includes(origin) || req.headers.get("X-Panel") !== "1") return fail(403, "Not from the panel.");
  }
  let body = {};
  if (method === "POST" || method === "PUT" || method === "PATCH") { try { body = await req.json(); } catch (e) { body = {}; } }

  if (path === "state") return adminState(env, req);
  if (path === "code" && method === "POST") {
    const hasPw = !!(await kvGet(env, "pw"));
    return askCode(env, req, hasPw ? "reset" : "set-up");
  }
  if (path === "setup/start" && method === "POST") return setupStart(env, req, body);
  if (path === "setup/finish" && method === "POST") return setupFinish(env, req, body);
  if (path === "login" && method === "POST") return login(env, req, body);

  const s = await session(env, req);
  if (!s) return fail(401, "Signed out.");

  if (path === "logout" && method === "POST") {
    await env.DB.prepare("DELETE FROM sessions WHERE h = ?").bind(s.h).run();
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  }
  if (path === "logout-all" && method === "POST") {
    await env.DB.prepare("DELETE FROM sessions").run();
    await log(env, req, true, "signed out everywhere");
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  }
  if (path === "password" && method === "POST") return changePassword(env, req, body);
  if (path === "security") {
    const logRows = (await env.DB.prepare("SELECT ts, ok, what, country, iph FROM authlog ORDER BY ts DESC LIMIT 60").all()).results;
    const sess = (await env.DB.prepare("SELECT created, expires, seen, country, agent, h FROM sessions WHERE expires > ? ORDER BY seen DESC").bind(now()).all()).results
      .map((x) => ({ created: x.created, expires: x.expires, seen: x.seen, country: x.country, agent: x.agent, current: x.h === s.h }));
    return json({ ok: true, log: logRows, sessions: sess });
  }
  if (path === "overview") {
    const counts = (await env.DB.prepare("SELECT status, COUNT(*) AS n FROM reports GROUP BY status").all()).results;
    const latest = (await env.DB.prepare("SELECT id, created, kind, addon, version, title, status FROM reports ORDER BY created DESC LIMIT 5").all()).results;
    const st = await stats(env, 7);
    return json({ ok: true, counts, latest, week: st.days, secrets: { discord: !!env.DISCORD_WEBHOOK, ideas: !!env.IDEAS_WEBHOOK, github: !!env.GITHUB_TOKEN, files: !!env.FILES } });
  }

  // inbox
  if (path === "reports") {
    const u = new URL(req.url);
    const status = u.searchParams.get("status") || "";
    const q = cut(u.searchParams.get("q") || "", 80);
    let sql = "SELECT id, created, kind, addon, version, game, title, what, contact, shot, status, note, issue, discord, country FROM reports";
    const where = [], args = [];
    if (status) { where.push("status = ?"); args.push(status); }
    if (q) { where.push("(title LIKE ? OR what LIKE ? OR id LIKE ? OR contact LIKE ?)"); args.push("%" + q + "%", "%" + q + "%", "%" + q + "%", "%" + q + "%"); }
    if (where.length) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY created DESC LIMIT 300";
    return json({ ok: true, reports: (await env.DB.prepare(sql).bind(...args).all()).results });
  }
  let m = path.match(/^reports\/([\w-]{1,48})(\/shot|\/issue)?$/);
  if (m) {
    const id = m[1];
    const r = await env.DB.prepare("SELECT * FROM reports WHERE id = ?").bind(id).first();
    if (!r) return fail(404, "No such report.");
    if (m[2] === "/shot") {
      if (!env.FILES) return fail(404, "No picture store.");
      const v = await env.FILES.getWithMetadata("shot:" + id, "arrayBuffer");
      if (!v || !v.value) return fail(404, "No picture.");
      return new Response(v.value, { headers: { "Content-Type": (v.metadata && v.metadata.type) || "image/jpeg", "Cache-Control": "private, max-age=3600" } });
    }
    if (m[2] === "/issue" && method === "POST") {
      const a = ADDONS.find((x) => x.id === (body.addon || r.addon));
      if (!a) return fail(400, "Pick which addon's GitHub this goes to.");
      if (!env.GITHUB_TOKEN) return fail(400, "The GitHub token is not set on the worker yet.");
      const labels = Array.isArray(body.labels) ? body.labels.filter((l) => /^[\w -]{1,30}$/.test(l)).slice(0, 5) : [];
      const res = await gh(env, `/repos/${OWNER}/${a.repo}/issues`, { method: "POST", body: { title: cut(body.title || r.title, 250), body: cut(body.body || "", 60000), labels } });
      if (!res.ok) return fail(502, "GitHub said no (" + res.status + "): " + ((res.data && res.data.message) || ""));
      await env.DB.prepare("UPDATE reports SET issue = ?, status = CASE WHEN status = 'new' THEN 'open' ELSE status END, updated = ? WHERE id = ?").bind(res.data.html_url, now(), id).run();
      return json({ ok: true, url: res.data.html_url });
    }
    if (method === "GET") return json({ ok: true, report: r });
    if (method === "POST") {
      const status = /^(new|open|done|ignored)$/.test(body.status || "") ? body.status : r.status;
      const note = body.note != null ? cut(body.note, 4000) : r.note;
      await env.DB.prepare("UPDATE reports SET status = ?, note = ?, updated = ? WHERE id = ?").bind(status, note, now(), id).run();
      return json({ ok: true });
    }
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM reports WHERE id = ?").bind(id).run();
      if (env.FILES) ctx.waitUntil(env.FILES.delete("shot:" + id));
      return json({ ok: true });
    }
  }

  if (path === "stats") return json(Object.assign({ ok: true }, await stats(env, Number(new URL(req.url).searchParams.get("days")) || 30)));
  if (path === "releases") return json(Object.assign({ ok: true }, await releases(env)));

  // the site's files on GitHub
  if (path === "files") {
    const t = await gh(env, `/repos/${OWNER}/${SITE_REPO}/git/trees/main?recursive=1`);
    if (!t.ok) return fail(502, "Could not list the site's files (" + t.status + ").");
    const files = (t.data.tree || []).filter((x) => x.type === "blob" && /\.(html|js|css|json|md|txt|xml)$|^CNAME$/i.test(x.path)).map((x) => ({ path: x.path, size: x.size }));
    return json({ ok: true, files });
  }
  if (path === "file") {
    const u = new URL(req.url);
    const p = method === "GET" ? u.searchParams.get("path") : body.path;
    if (!p || !/^[\w./ -]{1,200}$/.test(p) || p.includes("..")) return fail(400, "Bad file name.");
    const enc_p = p.split("/").map(encodeURIComponent).join("/");
    if (method === "GET") {
      const r = await gh(env, `/repos/${OWNER}/${SITE_REPO}/contents/${enc_p}?ref=main`);
      if (r.status === 404) return json({ ok: true, path: p, sha: "", content: "", missing: true });
      if (!r.ok) return fail(502, "Could not read " + p + " (" + r.status + ").");
      return json({ ok: true, path: p, sha: r.data.sha, content: fromb64(r.data.content) });
    }
    if (method === "PUT") {
      if (!env.GITHUB_TOKEN) return fail(400, "The GitHub token is not set on the worker yet.");
      const res = await gh(env, `/repos/${OWNER}/${SITE_REPO}/contents/${enc_p}`, {
        method: "PUT",
        body: { message: cut(body.message || ("Admin panel: update " + p), 200), content: utf8b64(String(body.content || "")), sha: body.sha || undefined, branch: "main" },
      });
      if (res.status === 409 || res.status === 422) return fail(409, "Someone changed this file since you opened it. Reload it and make the change again.");
      if (!res.ok) return fail(502, "GitHub said no (" + res.status + "): " + ((res.data && res.data.message) || ""));
      await log(env, req, true, "edited " + p);
      return json({ ok: true, sha: res.data.content.sha, commit: res.data.commit.html_url });
    }
  }
  if (path === "test-discord" && method === "POST") {
    const ok = await discord(env, "Test from the admin panel: reports will land here.");
    return ok ? json({ ok: true }) : fail(502, "Discord did not take the message.");
  }
  return fail(404, "Nothing here.");
}

// ------------------------------------------------------------------ entry
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!env.DB) return fail(500, "The worker has no database (binding DB).");
    await setup(env);
    try {
      if (url.pathname === "/api/report" && req.method === "POST") return await report(req, env, ctx);
      if (url.pathname === "/api/hit" && req.method === "POST") return await hit(req, env);
      if (url.pathname === "/api/health") return json({ ok: true, discord: !!env.DISCORD_WEBHOOK });
      if (url.pathname.startsWith("/admin/api/")) return await admin(req, env, ctx, url.pathname.slice("/admin/api/".length));
      return fail(404, "Nothing here.");
    } catch (e) {
      return fail(500, "Something went wrong on the server.");
    }
  },
};
