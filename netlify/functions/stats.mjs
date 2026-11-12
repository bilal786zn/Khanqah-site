import { getStore } from "@netlify/blobs";

const LIVE_WINDOW = 70_000; // a visitor counts as "listening now" if seen in the last 70s
const BOT = /bot|crawl|spider|preview|monitor|curl|wget|headless/i;

export default async (req, context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const store = getStore({ name: "stats", consistency: "strong" });
  const now = Date.now();
  const day = new Date(now + 2 * 3600000).toISOString().slice(0, 10); // day in SAST

  const s = (await store.get("data", { type: "json" })) || {};
  s.total ||= 0; s.unique ||= 0; s.live ||= {}; s.countries ||= {};
  if (!s.today || s.today.date !== day) s.today = { date: day, count: 0 };

  if (!BOT.test(req.headers.get("user-agent") || "")) {
    let b = {};
    try { b = await req.json(); } catch {}
    const id = String(b.id || "").slice(0, 40);
    if (id) {
      s.live[id] = now;
      if (b.newVisit) {
        s.total++; s.today.count++;
        if (b.newVisitor) s.unique++;
        const country = context.geo?.country?.name;
        if (country) s.countries[country] = (s.countries[country] || 0) + 1;
      }
    }
  }

  for (const k of Object.keys(s.live)) if (now - s.live[k] > LIVE_WINDOW) delete s.live[k];
  await store.setJSON("data", s);

  const countries = Object.entries(s.countries).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return Response.json(
    { total: s.total, unique: s.unique, today: s.today.count, online: Object.keys(s.live).length, countries },
    { headers: { "Cache-Control": "no-store" } }
  );
};

export const config = { path: "/api/stats" };
