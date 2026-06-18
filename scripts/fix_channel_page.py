#!/usr/bin/env python3
"""Generate the complete channel detail page to replace the truncated version."""

import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(PROJECT_ROOT, "app", "admin", "channels", "[id]", "page.tsx")

# Part 1: imports and setup (already exists in the file up to line 212)
# Part 2: the rest of the JSX that was truncated

# Read existing file up to the truncation point
with open(TARGET, "r", encoding="utf-8") as f:
    existing = f.read()

# Find the truncation point
marker = '          </div>\n'
last_idx = existing.rfind(marker)
if last_idx >= 0:
    base = existing[:last_idx + len(marker)]
else:
    base = existing

print(f"Base length: {len(base)} chars")
print(f"Last 50 chars: {repr(base[-50:])}")
