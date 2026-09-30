// Holt die Untis-Wochendateien (w00000.htm, w00001.htm, ...) der Schule und
// liefert sie als JSON: { files: [html, ...], stand, stale }
// Optionale Umgebungsvariablen (Netlify: Site configuration -> Environment variables):
//   VERTRETUNG_USER, VERTRETUNG_PASS  (falls die Schulseite passwortgeschützt ist)
//   VERTRETUNG_BASE (Standard unten), WEEKS (Standard 3)

const BASE = process.env.VERTRETUNG_BASE || "https://hollenberg-gymnasium.de/vertretungindex/";
const WEEKS = parseInt(process.env.WEEKS || "3", 10);
const TTL_MS = 60 * 1000;
let cache = { t: 0, files: [], stand: "" }; // bleibt nur solange die Function "warm" ist

const json = (status, body) => ({
  statusCode: status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  body: JSON.stringify(body),
});

async function fetchWeek(i, headers) {
  const url = `${BASE}w${String(i).padStart(5, "0")}.htm`;
  const r = await fetch(url, { headers });
  if (r.status === 404) return null;
  if (r.status === 401 || r.status === 403) {
    const e = new Error("Die Schulseite verlangt Zugangsdaten (VERTRETUNG_USER / VERTRETUNG_PASS in Netlify setzen).");
    e.status = 401;
    throw e;
  }
  if (!r.ok) throw new Error(`Schulseite antwortet mit HTTP ${r.status} (${url})`);
  return new TextDecoder("iso-8859-1").decode(await r.arrayBuffer()); // Untis-Export ist iso-8859-1
}

exports.handler = async (event) => {
  const force = event.queryStringParameters && event.queryStringParameters.force;
  if (!force && Date.now() - cache.t < TTL_MS && cache.files.length) {
    return json(200, { files: cache.files, stand: cache.stand, stale: false });
  }
  const headers = { "User-Agent": "Mozilla/5.0 (Stundenplan)" };
  if (process.env.VERTRETUNG_USER) {
    headers.Authorization = "Basic " + Buffer.from(`${process.env.VERTRETUNG_USER}:${process.env.VERTRETUNG_PASS || ""}`).toString("base64");
  }
  try {
    const all = await Promise.all(Array.from({ length: WEEKS }, (_, i) => fetchWeek(i, headers)));
    const files = all.filter(Boolean);
    const stand = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });
    cache = { t: Date.now(), files, stand };
    return json(200, { files, stand, stale: false });
  } catch (e) {
    if (e.status === 401) return json(401, { error: e.message });
    if (cache.files.length) return json(200, { files: cache.files, stand: cache.stand, stale: true });
    return json(502, { error: "Abruf fehlgeschlagen: " + e.message });
  }
};
