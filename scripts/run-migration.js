#!/usr/bin/env node
/**
 * Execute D1 migration via Cloudflare D1 HTTP API
 * Usage: node scripts/run-migration.js drizzle/0005_fix_api_key_schema.sql
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

if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !CF_D1_DATABASE_ID) {
  console.error('❌ Missing environment variables:');
  console.error('   CF_ACCOUNT_ID:', CF_ACCOUNT_ID ? '✓' : '✗');
  console.error('   CF_API_TOKEN:', CF_API_TOKEN ? '✓' : '✗');
  console.error('   CF_D1_DATABASE_ID:', CF_D1_DATABASE_ID ? '✓' : '✗');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node scripts/run-migration.js <migration-file.sql>');
  process.exit(1);
}

const sqlPath = path.resolve(migrationFile);
if (!fs.existsSync(sqlPath)) {
  console.error(`❌ Migration file not found: ${sqlPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

// Split by semicolons and filter out comments and empty lines
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

console.log(`📄 Migration file: ${path.basename(sqlPath)}`);
console.log(`📊 Database: ${CF_D1_DATABASE_ID}`);
console.log(`📝 Statements: ${statements.length}`);
console.log('');

async function executeStatement(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return await response.json();
}

async function runMigration() {
  console.log('🚀 Starting migration...\n');

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.length > 60 ? stmt.substring(0, 60) + '...' : stmt;

    try {
      console.log(`[${i + 1}/${statements.length}] Executing: ${preview}`);
      await executeStatement(stmt);
      console.log(`   ✓ Success\n`);
    } catch (error) {
      console.error(`   ✗ Failed: ${error.message}\n`);
      console.error('Full statement:', stmt);
      process.exit(1);
    }
  }

  console.log('✅ Migration completed successfully!');
}

runMigration().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
