#!/usr/bin/env node
// Reads existing truncated TSX and appends the rest to complete it.
// The rest content is stored as base64 to avoid escaping issues.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'app', 'admin', 'channels', '[id]', 'page.tsx');

const existing = fs.readFileSync(TARGET, 'utf8').trimEnd();
const marker = String.fromCharCode(32,32,32,32,32,32,32,32,32,32,32,32) + '</div>';
// Find last </div> that's inside the Associated API Keys header section
const idx = existing.lastIndexOf(marker);
if (idx < 0) { console.error('Marker not found'); process.exit(1); }
const base = existing.substring(0, idx + marker.length);
console.log('Base length:', base.length);

// Build the remaining TSX content as small string pieces
const N = '\n';
const rest = [
  N,
  '          {associatedKeys.length === 0 ? (',
  N,
  '            <p className="text-xs text-muted-foreground">暂无关联密钥</p>',
  N,
  '          ) : (',
  N,
  '            <Table>',
  N,
  '              <TableHeader>',
  N,
  '                <TableRow>',
  N,
  '                  <TableHead>名称</TableHead>',
  N,
  '                  <TableHead>前缀</TableHead>',
  N,
  '                  <TableHead>状态</TableHead>',
  N,
  '                  <TableHead>额度</TableHead>',
  N,
  '                </TableRow>',
  N,
  '              </TableHeader>',
  N,
  '              <TableBody>',
  N,
  '                {associatedKeys.map((key) => {',
  N,
].join('');
console.log('Rest part 1 length:', rest.length);
fs.writeFileSync(TARGET, base + rest, 'utf8');
console.log('Written part 1');
