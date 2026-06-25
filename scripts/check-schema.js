#!/usr/bin/env node
/**
 * Check D1 table schema
 */

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

async function checkSchema() {
  console.log('📊 Checking api_key table schema...\n');

  const result = await query("PRAGMA table_info(api_key)");

  if (result.success) {
    console.log('Columns in api_key table:');
    console.log('─'.repeat(80));
    result.result[0].results.forEach(col => {
      console.log(`  ${col.name.padEnd(20)} ${col.type.padEnd(10)} ${col.notnull ? 'NOT NULL' : ''}  ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    });
  } else {
    console.error('Failed:', result.errors);
  }
}

checkSchema().catch(console.error);
