/**
 * AppZed uptime-monitor (managed=true). Register endpoints, probe them on
 * a 5-minute cron, page on state flips. Schema self-initializes.
 * Bindings: DB (d1). No AI needed: uptime is a fact, not an opinion.
 */
const SCHEMA = "CREATE TABLE IF NOT EXISTS targets (id TEXT PRIMARY KEY, name TEXT, url TEXT, last_ok INTEGER DEFAULT 1, last_code INTEGER, last_ms INTEGER, last_at TEXT); CREATE TABLE IF NOT EXISTS checks (id INTEGER PRIMARY KEY AUTOINCREMENT, target_id TEXT, ok INTEGER, code INTEGER, ms INTEGER, at TEXT DEFAULT (datetime('now')))";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, solution: "uptime-monitor" });
    }
    if (request.method === "POST" && url.pathname === "/targets") {
      const body = await request.json().catch(() => null);
      if (!body || !body.url) return bad("url is required.");
      let parsed;
      try {
        parsed = new URL(body.url);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        return bad("url must be a valid http(s) URL.");
      }
      const id = crypto.randomUUID();
      await env.DB.exec(SCHEMA);
      await env.DB.prepare(
        "INSERT INTO targets (id, name, url) VALUES (?, ?, ?)"
      ).bind(id, body.name || parsed.hostname, body.url).run();
      return Response.json({ id }, { status: 201 });
    }
    if (request.method === "GET" && url.pathname === "/status") {
      await env.DB.exec(SCHEMA);
      const rows = await env.DB.prepare("SELECT * FROM targets ORDER BY name ASC").all();
      return Response.json({ targets: rows.results || [] });
    }
    const del = url.pathname.match(/^\/targets\/([^/]+)$/);
    if (request.method === "DELETE" && del) {
      await env.DB.prepare("DELETE FROM checks WHERE target_id = ?").bind(del[1]).run();
      const result = await env.DB.prepare("DELETE FROM targets WHERE id = ?").bind(del[1]).run();
      if ((result.meta.changes || 0) === 0) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json({ deleted: del[1] });
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env) {
    await env.DB.exec(SCHEMA);
    const rows = await env.DB.prepare("SELECT * FROM targets").all();
    const flips = [];
    for (const t of rows.results || []) {
      const check = await probe(t.url);
      await env.DB.prepare(
        "INSERT INTO checks (target_id, ok, code, ms) VALUES (?, ?, ?, ?)"
      ).bind(t.id, check.ok ? 1 : 0, check.code, check.ms).run();
      await env.DB.prepare(
        "UPDATE targets SET last_ok = ?, last_code = ?, last_ms = ?, last_at = datetime('now') WHERE id = ?"
      ).bind(check.ok ? 1 : 0, check.code, check.ms, t.id).run();
      if ((t.last_ok === 1) !== check.ok) {
        flips.push({ id: t.id, name: t.name, url: t.url, now_up: check.ok, code: check.code });
      }
    }
    await env.DB.prepare("DELETE FROM checks WHERE id NOT IN (SELECT id FROM checks ORDER BY id DESC LIMIT 1000)").run();
    return Response.json({ checked: (rows.results || []).length, flips });
  },
};

async function probe(url) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    await res.arrayBuffer().then((b) => b.byteLength).catch(() => 0);
    return { ok: res.ok, code: res.status, ms: Date.now() - start };
  } catch {
    return { ok: false, code: 0, ms: Date.now() - start };
  }
}

function bad(message) {
  return Response.json({ error: message }, { status: 400 });
}
