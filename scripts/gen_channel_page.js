#!/usr/bin/env node
/**
 * Generate the complete channel detail page.
 * Run: node scripts/gen_channel_page.js
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(PROJECT_ROOT, 'app', 'admin', 'channels', '[id]', 'page.tsx');

// Part 1: The imports and server component setup (already in file up to line 212)
const part1 = `import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { channels, apiKeys, usageLogs, users } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Key, Activity, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

const statusMap: Record<number, { label: string; tone: "success" | "warning" | "danger" | "muted" }> = {
  1: { label: "启用", tone: "success" },
  2: { label: "禁用", tone: "warning" },
  3: { label: "已删除", tone: "danger" },
};

const typeLabels: Record<string, string> = {
  cloudflare: "Cloudflare",
  openai: "OpenAI",
  anthropic: "Anthropic",
  azure: "Azure",
};

const keyStatusMap: Record<number, { label: string; tone: "success" | "danger" | "warning" | "muted" }> = {
  1: { label: "启用", tone: "success" },
  2: { label: "已禁用", tone: "danger" },
  3: { label: "已过期", tone: "warning" },
  4: { label: "额度耗尽", tone: "muted" },
};`;

console.log('Part 1 length:', part1.length);
fs.writeFileSync(TARGET + '.test', part1, 'utf8');
console.log('Test write OK');
