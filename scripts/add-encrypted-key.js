#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
}

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_D1_DATABASE_ID = process.env.CF_D1_DATABASE_ID;

async function query(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });

  return await response.json();
}

async function addColumn() {
  console.log('Adding encryptedKey column to api_key table...\n');

  const result = await query("ALTER TABLE api_key ADD COLUMN encryptedKey TEXT");

  if (result.success) {
    console.log('✅ Column added successfully!');
  } else {
    console.error('❌ Failed:', result.errors);
  }
}

addColumn().catch(console.error);
