// Ersetzt den Flask-Endpunkt /api/vertretung aus app.py als Netlify Function.
let cache: { t: number; files: string[] } = { t: 0, files: [] }

async function fetchWeek(base: string, i: number): Promise<string | null> {
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 (Stundenplan)" }
  const user = Netlify.env.get("VERTRETUNG_USER") || ""
  if (user) {
    const pass = Netlify.env.get("VERTRETUNG_PASS") || ""
    headers.Authorization = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64")
  }
  const r = await fetch(`${base}w${String(i).padStart(5, "0")}.htm`, {
    headers,
    signal: AbortSignal.timeout(15000),
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  // Untis-Export ist iso-8859-1
  return new TextDecoder("iso-8859-1").decode(await r.arrayBuffer())
}

export default async () => {
  const base = Netlify.env.get("VERTRETUNG_BASE") || "https://hollenberg-gymnasium.de/vertretungindex/"
  const weeks = parseInt(Netlify.env.get("WEEKS") || "3", 10)
  const ttl = parseInt(Netlify.env.get("CACHE_SECONDS") || "60", 10)

  if (Date.now() / 1000 - cache.t > ttl) {
    try {
      const results = await Promise.all(Array.from({ length: weeks }, (_, i) => fetchWeek(base, i)))
      cache = { t: Date.now() / 1000, files: results.filter((f): f is string => !!f) }
    } catch (e) {
      if (!cache.files.length) return Response.json({ error: String(e) }, { status: 502 })
    }
  }
  const stand = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })
  return Response.json({ files: cache.files, stand })
}

export const config = { path: "/api/vertretung" }
