// OPTIONAL. The site works without this.
//
// What it is for: config.js holds the Discord webhook address, and anyone who
// reads the site's files can see it. This small relay keeps the address out of
// the site: the site sends reports here, and this forwards them to Discord.
// It also turns away anything that is not from your site, too big, or coming
// too fast from one place.
//
// Setting it up (free Cloudflare account, about ten minutes):
//   1. dash.cloudflare.com > Workers & Pages > Create > Worker. Name it, Deploy.
//   2. Edit code: replace everything with this file. Deploy.
//   3. Settings > Variables and Secrets > add two:
//        DISCORD_WEBHOOK   (type Secret)  your webhook address
//        ALLOWED_ORIGIN    (type Text)    https://zac175.github.io
//   4. In the site's config.js set reportWebhook to the worker's address
//      (it looks like https://<name>.<you>.workers.dev). Commit and push.
//
// Not deployed or tried against the real Discord by Claude: it was only run
// against a stand-in. Test it with a report from the site after step 4.

const MAX_BYTES = 9 * 1024 * 1024;      // a report with a screenshot
const PER_10_MIN = 4;                   // reports from one address
const seen = new Map();                 // best effort: forgets when the worker restarts

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGIN || "").replace(/\/$/, "");
    const origin = request.headers.get("Origin") || "";
    const headers = cors(allowed || "*");

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return new Response("Reports only.", { status: 405, headers });
    if (allowed && origin !== allowed) return new Response("Not from the site.", { status: 403, headers });
    if (!env.DISCORD_WEBHOOK) return new Response("The relay has no webhook set.", { status: 500, headers });

    const size = Number(request.headers.get("Content-Length") || 0);
    if (size > MAX_BYTES) return new Response("Too big.", { status: 413, headers });

    const who = request.headers.get("CF-Connecting-IP") || "unknown";
    const now = Date.now();
    const times = (seen.get(who) || []).filter((t) => now - t < 10 * 60 * 1000);
    if (times.length >= PER_10_MIN) {
      return new Response(JSON.stringify({ retry_after: 120 }), { status: 429, headers: { ...headers, "Content-Type": "application/json" } });
    }
    times.push(now); seen.set(who, times);
    if (seen.size > 5000) seen.clear();

    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return new Response("Too big.", { status: 413, headers });

    const hook = env.DISCORD_WEBHOOK + (env.DISCORD_WEBHOOK.includes("?") ? "&" : "?") + "wait=true";
    const sent = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("Content-Type") || "application/json" },
      body,
    });
    // the site only needs to know whether it worked; Discord's answer stays here
    if (sent.ok) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
    const retry = sent.status === 429 ? await sent.json().catch(() => ({})) : {};
    return new Response(JSON.stringify({ ok: false, retry_after: retry.retry_after }), { status: sent.status === 429 ? 429 : 502, headers: { ...headers, "Content-Type": "application/json" } });
  },
};
