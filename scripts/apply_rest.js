#!/usr/bin/env node
// Append remaining content to channel detail page
// Content is base64-encoded to avoid all escaping issues
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'app', 'admin', 'channels', '[id]', 'page.tsx');

// Read the base64 content
const b64File = path.join(ROOT, 'scripts', 'channel_rest.b64');
const b64 = fs.readFileSync(b64File, 'utf8').replace(/[\r\n\s]/g, '');
const content = Buffer.from(b64, 'base64').toString('utf8');

// Append to existing file
const existing = fs.readFileSync(TARGET, 'utf8').trimEnd();
fs.writeFileSync(TARGET, existing + '\n' + content + '\n', 'utf8');
console.log('Done! Appended', content.length, 'chars');
console.log('Total:', existing.length + content.length + 2, 'chars');
