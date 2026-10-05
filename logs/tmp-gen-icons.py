#!/usr/bin/env python3
"""Generate Android launcher icons + splash bitmap from public/assets/brand/logo-mark.png."""
from PIL import Image
import os

SRC = "public/assets/brand/logo-mark.png"
RES = "mobile/android/app/src/main/res"

src = Image.open(SRC).convert("RGBA")
print("source:", src.size)

# ── Launcher icons: scale to 87.5% (breathing room), center on transparent ──
densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for name, size in densities.items():
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * 0.875)
    scaled = src.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(scaled, (off, off), scaled)
    out = os.path.join(RES, f"mipmap-{name}", "ic_launcher.png")
    canvas.save(out, "PNG")
    print("wrote", out, canvas.size)

# ── Native splash bitmap: logo at ~34% of typical 1080px-wide screen width ──
for name, size in {"mdpi": 120, "hdpi": 180, "xhdpi": 240, "xxhdpi": 360, "xxxhdpi": 480}.items():
    scaled = src.resize((size, size), Image.LANCZOS)
    out = os.path.join(RES, f"mipmap-{name}", "launch_image.png")
    scaled.save(out, "PNG")
    print("wrote", out)

print("done")
