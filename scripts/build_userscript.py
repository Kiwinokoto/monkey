#!/usr/bin/env python3
"""Build the installable userscript from TypeScript development sources."""
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "src"
OUTPUT = ROOT / "RER-Reader.user.js"
ESBUILD = ROOT / "node_modules" / ".bin" / "esbuild"
META = SOURCE_DIR / "userscript.meta.js"
PARTS = [SOURCE_DIR / "reader-buffer.ts", SOURCE_DIR / "auto-scroll.ts"]
GENERATED_NOTICE = """// GENERATED FILE — do not edit directly.
// Sources: src/userscript.meta.js + src/reader-buffer.ts + src/auto-scroll.ts
// Build: npm run build
"""
if not ESBUILD.exists():
    raise SystemExit("Missing esbuild. Run `npm ci` first.")
compiled=[]
for source in PARTS:
    result=subprocess.run([str(ESBUILD),str(source),"--target=es2022","--log-level=warning"],cwd=ROOT,check=True,capture_output=True,text=True)
    compiled.append(result.stdout.rstrip())
output=META.read_text(encoding="utf-8").rstrip()+"\n\n"+GENERATED_NOTICE.rstrip()+"\n\n"+"\n\n".join(compiled)+"\n"
OUTPUT.write_text(output,encoding="utf-8")
print(f"Built {OUTPUT.relative_to(ROOT)} from TypeScript sources")
