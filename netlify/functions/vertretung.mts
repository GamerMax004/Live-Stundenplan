// Holt den Untis-Vertretungsplan des Hollenberg-Gymnasiums (alle Wochen aus frames/navbar.htm).
// Zugangsdaten: Umgebungsvariablen VERTRETUNG_USER/VERTRETUNG_PASS oder Authorization-Header vom Browser.
const cache = new Map<string, { t: number; files: string[]; stand: string }>()

async function fetchText(url: string, auth: string): Promise<string | null> {
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 (Stundenplan)" }
  if (auth) headers.Authorization = auth
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
  if (r.status === 404) return null
  if (r.status === 401) throw Object.assign(new Error("Zugangsdaten fehlen oder sind falsch"), { status: 401 })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  // Untis-Export ist iso-8859-1
  return new TextDecoder("iso-8859-1").decode(await r.arrayBuffer())
}

export default async (req: Request) => {
  const base = Netlify.env.get("VERTRETUNG_BASE") || "https://hollenberg-gymnasium.de/vertretungsplan/"
  const ttl = parseInt(Netlify.env.get("CACHE_SECONDS") || "60", 10)
  const user = Netlify.env.get("VERTRETUNG_USER") || ""
  const auth = user
    ? "Basic " + Buffer.from(`${user}:${Netlify.env.get("VERTRETUNG_PASS") || ""}`).toString("base64")
    : req.headers.get("authorization") || ""

  const hit = cache.get(auth)
  if (hit && Date.now() / 1000 - hit.t <= ttl && !new URL(req.url).searchParams.has("force")) {
    return Response.json({ files: hit.files, stand: hit.stand }, { headers: { "Cache-Control": "no-store" } })
  }

  try {
    const nav = (await fetchText(`${base}frames/navbar.htm`, auth)) || ""
    const select = nav.match(/<select[^>]*name="week"[^>]*>([\s\S]*?)<\/select>/i)?.[1] || ""
    let weeks = [...select.matchAll(/<option[^>]*value="([^"]+)"/gi)].map((m) => m[1])
    if (!weeks.length) weeks = ["w"] // Fallback: alte Struktur ohne Wochenordner
    const stand = nav.match(/Stand:\s*([^<]+)/)?.[1].trim() || ""
    const results = await Promise.all(
      weeks.slice(0, 4).map((w) => fetchText(w === "w" ? `${base}w/w00000.htm` : `${base}${w}/w/w00000.htm`, auth)),
    )
    const files = results.filter((f): f is string => !!f)
    cache.set(auth, { t: Date.now() / 1000, files, stand })
    return Response.json({ files, stand }, { headers: { "Cache-Control": "no-store" } })
  } catch (e: any) {
    if (hit) return Response.json({ files: hit.files, stand: hit.stand, stale: true })
    return Response.json({ error: e.message || String(e) }, { status: e.status || 502 })
  }
}

export const config = { path: "/api/vertretung" }
