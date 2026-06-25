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

async function checkKeys() {
  console.log('📊 Checking recent API keys...\n');

  const result = await query(`
    SELECT
      api_key.id,
      api_key.name as key_name,
      api_key.prefix,
      api_key.channelId,
      channels.name as channel_name,
      channels.type as channel_type
    FROM api_key
    LEFT JOIN channels ON api_key.channelId = channels.id
    ORDER BY api_key.createdAt DESC
    LIMIT 5
  `);

  if (result.success) {
    console.log('Recent API Keys:');
    console.log('─'.repeat(100));
    console.log('ID'.padEnd(40), 'Key Name'.padEnd(20), 'Channel Name'.padEnd(15), 'Channel Type'.padEnd(15));
    console.log('─'.repeat(100));

    result.result[0].results.forEach(row => {
      console.log(
        row.id.substring(0, 8).padEnd(40),
        (row.key_name || '(null)').padEnd(20),
        (row.channel_name || '(null)').padEnd(15),
        (row.channel_type || '(null)').padEnd(15)
      );
    });
    console.log('\n');

    // Show raw data for dptest key
    const dptest = result.result[0].results.find(r => r.key_name === 'dptest');
    if (dptest) {
      console.log('Raw data for "dptest" key:');
      console.log(JSON.stringify(dptest, null, 2));
    }
  } else {
    console.error('Failed:', result.errors);
  }
}

checkKeys().catch(console.error);
