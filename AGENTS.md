<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Cloudflare AI Console

Next.js 16 App Router + React 19 + Tailwind v4 + Drizzle ORM + Auth.js v5, deployed on Vercel. Data (D1, KV, Workers AI) lives in Cloudflare and is reached over REST from Vercel — there is no local database; the app runs against a real D1 instance.

## Commands

- `npm run dev` — dev server on :3000 (requires valid `.env.local`)
- `npm run typecheck` / `npm run lint` — required before pushing; `npm run build` also used as a gate
- `npm run db:generate` / `npm run db:migrate` — drizzle-kit via the D1 HTTP driver; `drizzle.config.ts` reads CF creds directly from `.env.local`. Generated SQL lands in `drizzle/`.
- E2E: `npx playwright test` — there is NO `test:e2e` npm script (CLAUDE.md mentions one; it doesn't exist). Single file: `npx playwright test tests/e2e/<name>.spec.ts`. Config auto-starts `npm run dev`. Report: `npx playwright show-report`.
- No unit-test runner; verification = typecheck + lint + manual dev + Playwright.

## Env / setup

- `.env.local` is mandatory for both the app and drizzle-kit. Copy `.env.local.example`. Required: `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_D1_DATABASE_ID`, `CF_KV_NAMESPACE_ID`, `AUTH_SECRET`. `ADMIN_EMAILS` bootstraps admins.
- `API_KEY_ENCRYPTION_SECRET` encrypts stored API keys (viewing a secret decrypts with it). A key created under one secret can't be decrypted under another — local and prod must have their own secrets. `lib/auth/api-key.ts:8` has a fallback default; don't rely on it in prod.
- E2E tests log in as `test@example.com` / `test123456` and hit the **live** D1 DB — they need a real dev env with that user and they mutate real data.
- Production is `cloudai.fuwari.fun`; `git push origin main` auto-deploys via Vercel.

## Architecture (non-obvious)

- Route split (see `docs/API_ROUTES.md`, follows new-api conventions):
  - `/v1/*` — AI gateway (OpenAI + Anthropic compatible), auth via `sk-cfai-*` Bearer or `x-api-key`. NO `/api` prefix. `/v1/models` is intentionally public.
  - `/api/*` — business APIs; `/api/ai/*` — session-auth playground endpoints.
  - `proxy.ts` (Next 16 renamed `middleware.ts` → `proxy`) deliberately excludes `api` and `v1` from the auth redirect; keep it that way or external API clients get bounced to /login.
- Next 16: route-handler `params` and page `searchParams` are **Promises** — await them. `after()` from `next/server` is used to run `logUsage` after streaming responses; keep that pattern for streaming metering.
- Billing invariants (don't "fix" casually):
  - credits are the ledger unit. Two ledgers — `user.balanceCredits` and `apiKey.remainCredits` — both pre-checked and both deducted (`lib/usage/meter.ts`, `lib/billing/pricing.ts`).
  - Failed calls bill 0 credits. Streaming bills real tokens from the SSE usage chunk (`lib/usage/stream-intercept.ts`).
  - `model_pricing` prices are already in credits — do NOT multiply by the exchange rate again (regression fixed in commit 1e1a599). `base_multiplier` is 100 in prod.
  - Roles: `user.role` 1=user / 10=admin / 100=root. `proxy.ts` + server-side double gate.
- Third-party upstreams: `lib/channels/*` route by `apiKey.channelId` (openai / anthropic / deepseek adapters). The default `default-cloudflare` channel serves hosted models.
- Payment: two online-recharge gateways share `payment_order` + `lib/payment/order.ts` (channel-aware). epay (彩虹易支付, `lib/payment/epay.ts`) and LinuxDO Credit (`lib/payment/linuxdo.ts`, epay-compatible protocol). Per-channel config/rate in the `option` table (`epay_*` / `ldpay_*`); notifies at `/api/pay/{epay,linuxdo}/notify`. See `docs/features/linuxdo-credit-payment.md`.
- System settings live in the `option` KV table, read via `lib/settings/index.ts` (JSON-aware). `revalidatePath` is needed for immediate UI effects.

## Gotchas

- **Drizzle `leftJoin` is broken** in drizzle-orm v0.45.2 (field misalignment). Prefer separate queries + manual mapping. See `docs/fixes/2026-06-25-drizzle-leftjoin-bug.md`.
- Two migration tracks: `drizzle/` (drizzle-kit output) and `migrations/*.sql` (manual, applied via `scripts/run-migration.js`). Check both when changing schema; `lib/db/schema.ts` is the source of truth for drizzle-kit.
- API keys: format `sk-cfai-{20 base64url}`, status 1=active / 2=disabled / 3=expired / 4=exhausted.

## Conventions

- Every commit syncs related docs and appends `CHANGELOG.md` (Keep a Changelog). README mirrors feature status.
- Feature roadmap and architecture decisions live in `CLAUDE.md` (design reference: `D:\Download\new-api-main`).
