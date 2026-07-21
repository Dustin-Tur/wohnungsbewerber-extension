#!/usr/bin/env python3
"""
render-fast.py – rendert fast-video.html frame-genau zu 1080x1920 @ 60 fps H.264.

Unterschied zu render-video.py: dort nimmt Playwright die Seite in ECHTZEIT als
Screencast auf (variable Bildrate) – ein 1-Frame-Impact geht dabei verloren.
Hier wird die Buehne per virtueller Uhr fuer JEDEN Frame einzeln gestellt
(window.__frame(f)) und einzeln geschossen. Ergebnis: exakte Cut-Zeitpunkte,
echte 60 fps, sichtbare Ein-Frame-Shakes.

Ton: OfflineAudioContext in der Seite -> window.__exportWavBase64() -> WAV -> gemuxt.
ffmpeg: store-assets/.tools/ffmpeg (v6.0, libx264+aac) – dasselbe wie bisher.

  python3 render-fast.py                      # volles Video
  python3 render-fast.py --frames 0,120,300   # nur diese Frames als PNG (Kontrolle)
"""
import argparse, base64, functools, http.server, os, shutil, subprocess, sys, tempfile, threading, time

BASE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(BASE, "store-assets")
HTML = "fast-video.html"
FFMPEG = os.path.join(STORE, ".tools", "ffmpeg")
DEFAULT_OUT = "/Users/dustin/Desktop/BABA TIKTOK/WohnungsBewerber-8-Unter60Sekunden.mp4"
VIEW = {"width": 1080, "height": 1920}


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def start_server(directory):
    handler = functools.partial(_Quiet, directory=directory)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def encode(frames_dir, wav, out, fps, dur):
    cmd = [FFMPEG, "-y", "-framerate", str(fps), "-i", os.path.join(frames_dir, "%05d.jpg")]
    if wav:
        cmd += ["-i", wav]
    cmd += ["-map", "0:v:0"]
    if wav:
        cmd += ["-map", "1:a:0"]
    # Laenge NUR ueber -t auf der Ausgabe begrenzen (nie per atrim im Filtergraph -> ffmpeg haengt).
    cmd += ["-t", f"{dur:.4f}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high",
            "-crf", "18", "-preset", "medium", "-r", str(fps)]
    cmd += (["-c:a", "aac", "-b:a", "192k"] if wav else ["-an"])
    cmd += ["-movflags", "+faststart", out]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:])
        raise SystemExit(f"ffmpeg-Fehler ({r.returncode})")


def probe(path):
    r = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True)
    import re
    txt = r.stderr
    res = re.search(r"(\d{3,4})x(\d{3,4})", txt)
    fps = re.search(r"([\d.]+) fps", txt)
    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", txt)
    d = (int(dur.group(1)) * 3600 + int(dur.group(2)) * 60 + float(dur.group(3))) if dur else None
    return {"res": res.group(0) if res else "?", "fps": fps.group(1) if fps else "?",
            "dur": d, "mb": os.path.getsize(path) / 1e6, "audio": "Audio:" in txt}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--frames", default=None, help="Nur diese Frames als PNG rendern, z.B. 0,120,300")
    ap.add_argument("--shotdir", default=os.path.join(STORE, ".shots-fast"))
    args = ap.parse_args()

    if not os.path.exists(FFMPEG):
        raise SystemExit(f"ffmpeg fehlt: {FFMPEG}")

    from playwright.sync_api import sync_playwright
    httpd, port = start_server(STORE)
    tmp = tempfile.mkdtemp(prefix="wb_fast_")
    frames_dir = os.path.join(tmp, "f")
    os.makedirs(frames_dir, exist_ok=True)

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(viewport=VIEW, device_scale_factor=1)
            page.goto(f"http://127.0.0.1:{port}/{HTML}?record=1")
            page.wait_for_function("() => typeof window.__frame === 'function'")
            page.wait_for_timeout(300)  # Fonts/SVG settlen
            meta = page.evaluate("() => window.__setup()")
            fps, total = meta["fps"], meta["total"]
            print(f"[setup] {meta['bpm']} BPM · {meta['shots']} Shots · {total} Frames @ {fps} fps = {meta['dur']}s")

            # --- Nur Kontroll-Frames? ---
            if args.frames:
                os.makedirs(args.shotdir, exist_ok=True)
                for f in [int(x) for x in args.frames.split(",")]:
                    info = page.evaluate("(f) => window.__frame(f)", f)
                    p = os.path.join(args.shotdir, f"f{f:05d}_shot{info['shot']:02d}_{info['t']}s.png")
                    page.screenshot(path=p)
                    print(f"  frame {f:5d}  t={info['t']:>7}s  shot {info['shot']:2d}  -> {os.path.basename(p)}")
                browser.close()
                return

            # --- Ton ---
            print("[audio] OfflineAudioContext …")
            b64 = page.evaluate("async () => await window.__exportWavBase64()")
            wav = os.path.join(tmp, "a.wav")
            with open(wav, "wb") as fh:
                fh.write(base64.b64decode(b64))
            print(f"[audio] {os.path.getsize(wav)/1e6:.1f} MB WAV")

            # --- Frames ---
            t0 = time.time()
            for f in range(total):
                page.evaluate("(f) => window.__frame(f)", f)
                page.screenshot(path=os.path.join(frames_dir, f"{f:05d}.jpg"), type="jpeg", quality=95)
                if f % 120 == 0 and f:
                    el = time.time() - t0
                    print(f"  … {f}/{total}  ({el:.0f}s, ~{el/f*(total-f):.0f}s verbleibend)")
            print(f"[frames] {total} Stück in {time.time()-t0:.0f}s")
            browser.close()

        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        print("[encode] H.264 …")
        encode(frames_dir, wav, args.out, fps, total / fps)
        p = probe(args.out)
        print(f"[fertig] {args.out}")
        print(f"         {p['res']} · {p['fps']} fps · {p['dur']:.2f}s · {p['mb']:.1f} MB · Ton: {'ja' if p['audio'] else 'NEIN'}")
    finally:
        httpd.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
