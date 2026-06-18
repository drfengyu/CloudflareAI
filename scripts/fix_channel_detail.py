#!/usr/bin/env python3
"""Append remaining TSX to the channel detail page (Parts 9+)."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "app", "admin", "channels", "[id]", "page.tsx")
Q = chr(34)  # double quote
N = chr(10)  # newline

L = []

def a(s):
    L.append(s)

# === Key table rows (inside the map return) ===
a('                    <TableRow>')
a('                      <TableCell className=' + Q + 'font-medium' + Q + '>{key.name}</TableCell>')
a('                      <TableCell><code className=' + Q + 'text-xs font-mono' + Q + '>{key.prefix}...</code></TableCell>')
a('                      <TableCell><Badge tone={ks.tone}>{ks.label}</Badge></TableCell>')
a('                      <TableCell>')
a('                        {key.quotaCredits ? (')
a('                          <>')
a('                            {((key.remainCredits || 0) / 100).toFixed(2)} / {(key.quotaCredits / 100).toFixed(2)}')
a('                          </>')
a('                        ) : (')
a('                          <>—</>')
a('                        )}')
a('                      </TableCell>')
a('                    </TableRow>')
a('                  );')
a('                })}')
a('              </TableBody>')
a('            </Table>')
a('          )}')
a('        </CardContent>')
a('      </Card>')

# === Top Models ===
a('')
a('      {/* Top 10 Models */}')
a('      <Card>')
a('        <CardContent className=' + Q + 'pt-5' + Q + '>')
a('          <div className=' + Q + 'flex items-center gap-2 mb-4' + Q + '>')
a('            <BarChart3 className=' + Q + 'h-4 w-4' + Q + ' />')
a('            <h3 className=' + Q + 'text-sm font-medium' + Q + '>热门模型 (Top 10)</h3>')
a('          </div>')
a('')
a('          {topModels.length === 0 ? (')
a('            <p className=' + Q + 'text-xs text-muted-foreground' + Q + '>暂无调用数据</p>')
a('          ) : (')
a('            <Table>')
a('              <TableHeader>')
a('                <TableRow>')
a('                  <TableHead>模型</TableHead>')
a('                  <TableHead className=' + Q + 'text-right' + Q + '>调用次数</TableHead>')
a('                  <TableHead className=' + Q + 'text-right' + Q + '>消耗 Credits</TableHead>')
a('                </TableRow>')
a('              </TableHeader>')
a('              <TableBody>')
a('                {topModels.map((m, i) => (')
a('                  <TableRow key={m.model || i}>')
a('                    <TableCell className=' + Q + 'font-medium text-xs' + Q + '>{m.model || ' + Q + '—' + Q + '}</TableCell>')
a('                    <TableCell className=' + Q + 'text-right' + Q + '>{m.callCount.toLocaleString()}</TableCell>')
a('                    <TableCell className=' + Q + 'text-right' + Q + '>{Number(m.creditsUsed).toLocaleString()} cr</TableCell>')
a('                  </TableRow>')
a('                ))}')
a('              </TableBody>')
a('            </Table>')
a('          )}')
a('        </CardContent>')
a('      </Card>')
a('    </div>')
a('  );')
a('}')

# Read existing and append
with open(TARGET, "r", encoding="utf-8") as f:
    existing = f.read().rstrip()

# Also fix lines 91-92 which are broken var BT = `; var D = $;
# Replace them with proper code
lines = existing.split(N)
fixed = False
for i in range(len(lines)):
    if "var BT =" in lines[i] and "var D = $" in lines[i+1] if i+1 < len(lines) else False:
        lines[i] = "  // Backtick/dollar for template literals"
        lines[i+1] = ""
        fixed = True
        break
    elif "var BT = " in lines[i] and ";" in lines[i]:
        lines[i] = ""
        fixed = True

if fixed:
    # Remove empty lines that resulted
    lines = [l for l in lines if l != ""]
    # Re-count lines
    existing = N.join(lines)
    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(existing)
    print("Fixed BT/D artifact lines")

# Try to fix var->const for main variables
lines = existing.split(N)
new_lines = []
for line in lines:
    # Fix top-level variable declarations (var -> const) in data fetching section
    # Only fix non-generator variables
    trimmed = line.lstrip()
    if trimmed.startswith("var ") and "=" in trimmed:
        # Check if it's in the data fetching section (after component function body)
        indent = line[:len(line) - len(line.lstrip())]
        var_name = trimmed.split("=")[0].replace("var ", "").strip()
        # Only fix specific known variable names
        known_vars = ["statsRows", "stats", "topModels", "configObject", "keyStats", "i", "s"]
        if var_name in known_vars or any(var_name.startswith(v) for v in known_vars):
            new_lines.append(indent + "const " + trimmed[4:])
            continue
    # Fix for-loop var
    if trimmed.startswith("for (var ") and trimmed.endswith(") {"):
        new_lines.append(line.replace("for (var ", "for (let "))
        continue
    new_lines.append(line)

existing = N.join(new_lines)

# Append new content
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(existing + N + N.join(L) + N)

new_total = len((existing + N + N.join(L) + N).split(N))
print(f"Appended {len(L)} lines")
print(f"Total lines: {new_total}")
print("Done!")
