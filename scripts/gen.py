#!/usr/bin/env python3
"""Generate channel detail page."""
import os

target = os.path.join(
    "E:", os.sep, "Project", "Github", "Useful", "CloudflareAI",
    "app", "admin", "channels", "[id]", "page.tsx"
)

# Read template and write
template_path = os.path.join(os.path.dirname(__file__), "channel-detail-template.tsx")
with open(template_path, "r", encoding="utf-8") as f:
    content = f.read()

os.makedirs(os.path.dirname(target), exist_ok=True)
with open(target, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Written to {target}")
