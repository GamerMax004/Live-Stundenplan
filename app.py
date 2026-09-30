import os, time
import requests
from flask import Flask, jsonify, send_from_directory

app = Flask(__name__, static_folder="static")

BASE = os.environ.get("VERTRETUNG_BASE", "https://hollenberg-gymnasium.de/vertretungindex/")
USER = os.environ.get("VERTRETUNG_USER", "")   # optional
PASSWORD = os.environ.get("VERTRETUNG_PASS", "")  # optional
WEEKS = int(os.environ.get("WEEKS", "3"))       # w00000 ... w0000N
TTL = int(os.environ.get("CACHE_SECONDS", "60"))
_cache = {"t": 0, "files": []}


def fetch_week(i):
    r = requests.get(
        f"{BASE}w{i:05d}.htm",
        auth=(USER, PASSWORD) if USER else None,
        headers={"User-Agent": "Mozilla/5.0 (Stundenplan)"},
        timeout=15,
    )
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.content.decode("iso-8859-1")  # Untis-Export ist iso-8859-1


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/vertretung")
def vertretung():
    if time.time() - _cache["t"] > TTL:
        try:
            files = [f for f in (fetch_week(i) for i in range(WEEKS)) if f]
            _cache.update(t=time.time(), files=files)
        except requests.RequestException as e:
            if not _cache["files"]:
                return jsonify(error=str(e)), 502
    return jsonify(files=_cache["files"], stand=time.strftime("%d.%m.%Y %H:%M"))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
