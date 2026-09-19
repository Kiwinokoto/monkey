#!/usr/bin/env python3
"""Build the installable userscript from the modular source files."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "src"
OUTPUT = ROOT / "RER-Reader.user.js"

PARTS = [
    SOURCE_DIR / "userscript.meta.js",
    SOURCE_DIR / "reader-buffer.js",
    SOURCE_DIR / "auto-scroll.js",
]

GENERATED_NOTICE = """// GENERATED FILE — do not edit directly.
// Sources: src/userscript.meta.js + src/reader-buffer.js + src/auto-scroll.js
// Build: python scripts/build_userscript.py
"""

contents = [path.read_text(encoding="utf-8").rstrip() for path in PARTS]
output = (
    contents[0]
    + "\n\n"
    + GENERATED_NOTICE.rstrip()
    + "\n\n"
    + contents[1]
    + "\n\n"
    + contents[2]
    + "\n"
)

OUTPUT.write_text(output, encoding="utf-8")
print(f"Built {OUTPUT.relative_to(ROOT)} from {len(PARTS)} source files")
