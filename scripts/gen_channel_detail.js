#!/usr/bin/env node
/**
 * Generate the complete channel detail page TSX.
 * Uses only string concatenation (no template literals) to avoid escaping issues.
 * Run: node scripts/gen_channel_detail.js
 */
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var TARGET = path.join(ROOT, 'app', 'admin', 'channels', '[id]', 'page.tsx');

var Q = String.fromCharCode(34);  // double quote
var S = String.fromCharCode(39);  // single quote
var BT = String.fromCharCode(96); // backtick
var D = String.fromCharCode(36);  // dollar
var N = String.fromCharCode(10);  // newline

var L = [];
var a = function(s) { L.push(s); };

// Imports
a('import { auth } from ' + Q + '@/auth' + Q + ';');
a('import { db } from ' + Q + '@/lib/db/d1-http' + Q + ';');
a('import { channels, apiKeys, usageLogs, users } from ' + Q + '@/lib/db/schema' + Q + ';');
a('import { eq, sql, desc } from ' + Q + 'drizzle-orm' + Q + ';');
a('import { notFound, redirect } from ' + Q + 'next/navigation' + Q + ';');
a('import Link from ' + Q + 'next/link' + Q + ';');
a('import { Card, CardContent } from ' + Q + '@/components/ui/card' + Q + ';');
a('import { Badge } from ' + Q + '@/components/ui/badge' + Q + ';');
a('import {');
a('  Table,');
a('  TableBody,');
a('  TableCell,');
a('  TableHead,');
a('  TableHeader,');
a('  TableRow,');
a('} from ' + Q + '@/components/ui/table' + Q + ';');
a('import { ArrowLeft, Key, Activity, BarChart3 } from ' + Q + 'lucide-react' + Q + ';');
a('');
a('export const dynamic = ' + Q + 'force-dynamic' + Q + ';');

console.log('Writing ' + L.length + ' import/setup lines...');

// Write first part
fs.writeFileSync(TARGET, L.join(N) + N, 'utf8');
console.log('Part 1 written');

// Status maps and type labels
L = [];
a = function(s) { L.push(s); };

a('');
a('const statusMap: Record<number, { label: string; tone: ' + Q + 'success' + Q + ' | ' + Q + 'warning' + Q + ' | ' + Q + 'danger' + Q + ' | ' + Q + 'muted' + Q + ' }> = {');
a('  1: { label: ' + Q + '启用' + Q + ', tone: ' + Q + 'success' + Q + ' },');
a('  2: { label: ' + Q + '禁用' + Q + ', tone: ' + Q + 'warning' + Q + ' },');
a('  3: { label: ' + Q + '已删除' + Q + ', tone: ' + Q + 'danger' + Q + ' },');
a('};');
a('');
a('const typeLabels: Record<string, string> = {');
a('  cloudflare: ' + Q + 'Cloudflare' + Q + ',');
a('  openai: ' + Q + 'OpenAI' + Q + ',');
a('  anthropic: ' + Q + 'Anthropic' + Q + ',');
a('  azure: ' + Q + 'Azure' + Q + ',');
a('};');
a('');
a('const keyStatusMap: Record<number, { label: string; tone: ' + Q + 'success' + Q + ' | ' + Q + 'danger' + Q + ' | ' + Q + 'warning' + Q + ' | ' + Q + 'muted' + Q + ' }> = {');
a('  1: { label: ' + Q + '启用' + Q + ', tone: ' + Q + 'success' + Q + ' },');
a('  2: { label: ' + Q + '已禁用' + Q + ', tone: ' + Q + 'danger' + Q + ' },');
a('  3: { label: ' + Q + '已过期' + Q + ', tone: ' + Q + 'warning' + Q + ' },');
a('  4: { label: ' + Q + '额度耗尽' + Q + ', tone: ' + Q + 'muted' + Q + ' },');
a('};');

fs.appendFileSync(TARGET, L.join(N) + N, 'utf8');
console.log('Part 2 written (maps)');

L = [];
a = function(s) { L.push(s); };

// Component function
a('');
a('export default async function ChannelDetailPage({');
a('  params,');
a('}: {');
a('  params: Promise<{ id: string }>;');
a('}) {');
a('  const { id } = await params;');
a('');
a('  const session = await auth();');
a('  if (!session?.user?.id) {');
a('    notFound();');
a('  }');
a('');
a('  const currentUser = await db');
a('    .select({ role: users.role })');
a('    .from(users)');
a('    .where(eq(users.id, session.user.id))');
a('    .limit(1);');
a('');
a('  if (!currentUser[0] || currentUser[0].role < 10) {');
a('    redirect(' + Q + '/dashboard' + Q + ');');
a('  }');
a('');
a('  const channelRows = await db');
a('    .select()');
a('    .from(channels)');
a('    .where(eq(channels.id, id))');
a('    .limit(1);');
a('');
a('  const channel = channelRows[0];');
a('  if (!channel) {');
a('    notFound();');
a('  }');
a('');
a('  const statusInfo = statusMap[channel.status] || { label: ' + Q + '未知' + Q + ', tone: ' + Q + 'muted' + Q + ' as const };');

fs.appendFileSync(TARGET, L.join(N) + N, 'utf8');
console.log('Part 3 written (component start)');

L = [];
a = function(s) { L.push(s); };

// Data fetching
a('');
a('  // Associated API Keys');
a('  const associatedKeys = await db');
a('    .select({');
a('      id: apiKeys.id,');
a('      name: apiKeys.name,');
a('      prefix: apiKeys.prefix,');
a('      status: apiKeys.status,');
a('      quotaCredits: apiKeys.quotaCredits,');
a('      remainCredits: apiKeys.remainCredits,');
a('      userId: apiKeys.userId,');
a('    })');
a('    .from(apiKeys)');
a('    .where(eq(apiKeys.channelId, id));');
a('');
a('  // Usage stats');
a('  var BT = ' + BT + ';');
a('  var D = ' + D + ';');
a('  var statsRows = await db');
a('    .select({');
a('      totalCalls: sql' + BT + 'count(*)' + BT + ',');
a('      totalCredits: sql' + BT + 'coalesce(sum(' + D + '{usageLogs.creditsUsed}), 0)' + BT + ',');
a('      totalInputTokens: sql' + BT + 'coalesce(sum(' + D + '{usageLogs.inputTokens}), 0)' + BT + ',');
a('      totalOutputTokens: sql' + BT + 'coalesce(sum(' + D + '{usageLogs.outputTokens}), 0)' + BT + ',');
a('    })');
a('    .from(usageLogs)');
a('    .where(eq(usageLogs.channelId, id));');
a('');
a('  var stats = statsRows[0] || {');
a('    totalCalls: 0,');
a('    totalCredits: 0,');
a('    totalInputTokens: 0,');
a('    totalOutputTokens: 0,');
a('  };');

fs.appendFileSync(TARGET, L.join(N) + N, 'utf8');
console.log('Part 4 written (data fetching)');

L = [];
a = function(s) { L.push(s); };

// Top models + config parsing
a('');
a('  // Top 10 models by call count');
a('  var topModels = await db');
a('    .select({');
a('      model: usageLogs.model,');
a('      callCount: sql' + BT + 'count(*)' + BT + ',');
a('      creditsUsed: sql' + BT + 'coalesce(sum(' + D + '{usageLogs.creditsUsed}), 0)' + BT + ',');
a('    })');
a('    .from(usageLogs)');
a('    .where(eq(usageLogs.channelId, id))');
a('    .groupBy(usageLogs.model)');
a('    .orderBy(desc(sql' + BT + 'count(*)' + BT + '))');
a('    .limit(10);');
a('');
a('  // Parse config');
a('  var configObject = null;');
a('  try {');
a('    configObject = channel.config ? JSON.parse(channel.config) : null;');
a('  } catch (e) {');
a('    configObject = null;');
a('  }');
a('');
a('  // Count keys by status');
a('  var keyStats = {};');
a('  for (var i = 0; i < associatedKeys.length; i++) {');
a('    var s = associatedKeys[i].status || 1;');
a('    keyStats[s] = (keyStats[s] || 0) + 1;');
a('  }');

fs.appendFileSync(TARGET, L.join(N) + N, 'utf8');
console.log('Part 5 written (top models + config)');

L = [];
a = function(s) { L.push(s); };

// JSX return start
a('');
a('  return (');
a('    <div className=' + Q + 'p-8 space-y-6' + Q + '>');
a('      {/* Back link */}');
a('      <div className=' + Q + 'flex items-center gap-4' + Q + '>');
a('        <Link');
a('          href=' + Q + '/admin/channels' + Q + '');
a('          className=' + Q + 'flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground' + Q + '');
a('        >');
a('          <ArrowLeft className=' + Q + 'h-4 w-4' + Q + ' />');
a('          返回渠道列表');
a('        </Link>');
a('      </div>');
a('');
a('      <div className=' + Q + 'flex items-center gap-3' + Q + '>');
a('        <h1 className=' + Q + 'text-2xl font-bold' + Q + '>{channel.name}</h1>');
a('        <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>');
a('      </div>');
a('');
a('      {/* Channel Info */}');
a('      <Card>');
a('        <CardContent className=' + Q + 'pt-5' + Q + '>');
a('          <div className=' + Q + 'grid grid-cols-2 gap-4 sm:grid-cols-4' + Q + '>');
a('            <div>');
a('              <p className=' + Q + 'text-xs text-muted-foreground' + Q + '>类型</p>');
a('              <p className=' + Q + 'mt-1 text-sm font-medium' + Q + '>');
a('                {typeLabels[channel.type || ' + Q + Q + '] || channel.type || ' + Q + '—' + Q + '}');
a('              </p>');
a('            </div>');

fs.appendFileSync(TARGET, L.join(N) + N, 'utf8');
console.log('Part 6 written (JSX start)');

L = [];
a = function(s) { L.push(s); };

a('            <div>');
a('              <p className=' + Q + 'text-xs text-muted-foreground' + Q + '>关联密钥</p>');
a('              <p className=' + Q + 'mt-1 text-sm font-medium' + Q + '>{associatedKeys.length} 个</p>');
a('            </div>');
a('            <div>');
a('              <p className=' + Q + 'text-xs text-muted-foreground' + Q + '>总调用</p>');
a('              <p className=' + Q + 'mt-1 text-sm font-medium' + Q + '>{stats.totalCalls.toLocaleString()} 次</p>');
a('            </div>');
a('            <div>');
a('              <p className=' + Q + 'text-xs text-muted-foreground' + Q + '>总消耗</p>');
a('              <p className=' + Q + 'mt-1 text-sm font-medium' + Q + '>{stats.totalCredits.toLocaleString()} cr</p>');
a('            </div>');
a('            <div>');
a('              <p className=' + Q + 'text-xs text-muted-foreground' + Q + '>输入 Tokens</p>');
a('              <p className=' + Q + 'mt-1 text-sm font-medium' + Q + '>{stats.totalInputTokens.toLocaleString()}</p>');
a('            </div>');
a('            <div>');
a('              <p className=' + Q + 'text-xs text-muted-foreground' + Q + '>输出 Tokens</p>');
a('              <p className=' + Q + 'mt-1 text-sm font-medium' + Q + '>{stats.totalOutputTokens.toLocaleString()}</p>');
a('            </div>');
a('            <div>');
a('              <p className=' + Q + 'text-xs text-muted-foreground' + Q + '>渠道 ID</p>');
a('              <p className=' + Q + 'mt-1 text-sm font-mono text-xs' + Q + '>{channel.id}</p>');
a('            </div>');
a('            <div>');
a('              <p className=' + Q + 'text-xs text-muted-foreground' + Q + '>创建时间</p>');
a('              <p className=' + Q + 'mt-1 text-sm' + Q + '>');
a('                {channel.createdAt ? new Date(channel.createdAt).toLocaleDateString(' + Q + 'zh-CN' + Q + ') : ' + Q + '—' + Q + '}');
a('              </p>');
a('            </div>');
a('          </div>');
a('        </CardContent>');
a('      </Card>');

fs.appendFileSync(TARGET, L.join(N) + N, 'utf8');
console.log('Part 7 written (stats grid)');

L = [];
a = function(s) { L.push(s); };

// Config card
a('');
a('      {/* Config JSON */}');
a('      {configObject && Object.keys(configObject).length > 0 && (');
a('        <Card>');
a('          <CardContent className=' + Q + 'pt-5' + Q + '>');
a('            <h3 className=' + Q + 'text-sm font-medium mb-3' + Q + '>渠道配置</h3>');
a('            <div className=' + Q + 'space-y-2' + Q + '>');
a('              {Object.entries(configObject).map(([key, value]) => (');
a('                <div key={key} className=' + Q + 'flex items-center justify-between py-1 border-b border-border last:border-0' + Q + '>');
a('                  <span className=' + Q + 'text-xs font-medium' + Q + '>{key}</span>');
a('                  <span className=' + Q + 'text-xs text-muted-foreground break-all max-w-[60%] text-right' + Q + '>{String(value)}</span>');
a('                </div>');
a('              ))}');
a('            </div>');
a('          </CardContent>');
a('        </Card>');
a('      )}');
a('');
a('      {/* Associated API Keys */}');
a('      <Card>');
a('        <CardContent className=' + Q + 'pt-5' + Q + '>');
a('          <div className=' + Q + 'flex items-center gap-2 mb-4' + Q + '>');
a('            <Key className=' + Q + 'h-4 w-4' + Q + ' />');
a('            <h3 className=' + Q + 'text-sm font-medium' + Q + '>关联密钥 ({associatedKeys.length})</h3>');
a('          </div>');
a('');
a('          {associatedKeys.length === 0 ? (');
a('            <p className=' + Q + 'text-xs text-muted-foreground' + Q + '>暂无关联密钥</p>');
a('          ) : (');
a('            <Table>');
a('              <TableHeader>');
a('                <TableRow>');
a('                  <TableHead>名称</TableHead>');
a('                  <TableHead>前缀</TableHead>');
a('                  <TableHead>状态</TableHead>');
a('                  <TableHead>额度</TableHead>');
a('                </TableRow>');
a('              </TableHeader>');
a('              <TableBody>');
a('                {associatedKeys.map((key) => {');
a('                  var ks = keyStatusMap[key.status || 1] || { label: ' + Q + '未知' + Q + ', tone: ' + Q + 'muted' + Q + ' as const };');
a('                  return (');

fs.appendFileSync(TARGET, L.join(N) + N, 'utf8');
console.log('Part 8 written (config card + API keys header)');
