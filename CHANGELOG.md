# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-06-15

### Added

- **API Key Management Enhancements**
  - Added usage statistics per key (call count + credits used)
  - Added "调用" column showing calls and consumption for each key
  - Added progress bars for quota visualization (unlimited and limited keys)
  - Added real-time usage tracking via `usage_log` aggregation
- **Error Tracking System**
  - Added `errorReason` field to `usage_log` table
  - Error records now display error messages with tooltips
  - All API error handlers now capture and store error reasons
- **Channel Identification**
  - Distinct channel labels: 站内 (web), OpenAI, Anthropic
  - Clear separation between playground and API client calls
- **UI Improvements**
  - Grid-based aligned list layout for history and dashboard
  - Fixed-width columns for proper vertical alignment
  - Right-aligned numeric metrics (credits, latency, time)

### Changed

- **API Key Requirements**
  - All Playground APIs now require valid API key (text, image, embeddings, translate, vision)
  - Return 403 if user has no API key created
  - All records must be associated with an apiKeyId
- **Quota Display Logic**
  - Unlimited keys: show `used / account balance` with percentage
  - Limited keys: show `remaining / quota` with progress bar
  - Removed misleading progress bars without proper data backing
- **Billing System**
  - Fixed error calls to charge 0 credits (previously charged estimated amount)
  - Error records now correctly display "—" for credits
  - Improved FLUX-2 multipart response parsing

### Fixed

- **API Key Editing**
  - Fixed KeySheet not remounting when switching between keys (added `key` prop)
  - Fixed empty string causing NaN in database (added trim + conditional parseInt)
  - Added balance validation: API key quota cannot exceed account balance
- **Data Accuracy**
  - Refunded 15,500 cr from 4 error records that were incorrectly charged
  - Corrected total usage from 43,982 cr to 28,482 cr
  - Balance restored from 6,018 cr to 21,518 cr
- **List Alignment**
  - Fixed misaligned list items due to varying content lengths
  - Implemented CSS Grid with fixed column widths
  - All numeric metrics now properly right-aligned

### Security

- Added server-side validation to prevent API key quota from exceeding user balance
- All Playground endpoints now require authentication and valid API key

## [0.1.0] - 2026-06-14

### Added

- **Core Features**
  - User authentication with Auth.js v5
  - API key generation and management
  - Multi-model support (text, image, embedding, vision, translation)
  - Usage tracking and logging
  - Credit-based billing system
- **Dashboard**
  - Real-time balance display
  - Hourly and daily usage charts (recharts)
  - Model usage distribution charts
  - Recent 10 calls list
- **Playground**
  - Text generation (LLaMA, Qwen, DeepSeek)
  - Image generation (FLUX, Stable Diffusion)
  - Vision (image understanding)
  - Embeddings
  - Translation
- **API Compatibility**
  - OpenAI-compatible endpoints (`/api/openai/v1/*`)
  - Anthropic-compatible endpoints (`/api/anthropic/v1/*`)
  - Model listing and chat completions
- **Database**
  - Cloudflare D1 with Drizzle ORM
  - Schema: users, api_keys, usage_log, conversations, topup, option
  - Migration system via `/api/db-migrate`

### Technical Stack

- Next.js 16 (App Router)
- React 19
- Tailwind CSS v4
- TypeScript
- Cloudflare D1 + Drizzle ORM
- Auth.js v5
- Recharts for data visualization

[Unreleased]: https://github.com/drfengyu/CloudflareAI/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/drfengyu/CloudflareAI/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/drfengyu/CloudflareAI/releases/tag/v0.1.0
