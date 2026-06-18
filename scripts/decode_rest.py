#!/usr/bin/env python3
"""Generate the remaining TSX content and append to the channel detail page."""
import os, base64

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "app", "admin", "channels", "[id]", "page.tsx")

# Read a base64 file with the remaining content
B64_FILE = os.path.join(ROOT, "scripts", "channel_rest.b64")
with open(B64_FILE, "r") as f:
    b64 = f.read().replace("\n", "").replace("\r", "").strip()

remaining = base64.b64decode(b64).decode("utf-8")

with open(TARGET, "r", encoding="utf-8") as f:
    existing = f.read().rstrip()

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(existing + "\n" + remaining)

print(f"Appended {len(remaining)} chars to {TARGET}")
print(f"Total now: {len(existing) + len(remaining) + 1} chars")
