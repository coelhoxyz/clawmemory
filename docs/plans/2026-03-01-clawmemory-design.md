# ClawMemory Design

## Overview

ClawMemory is a standalone Node.js/TypeScript library for managing AI agent context and memory. Channel-agnostic — works with NanoClaw, OpenClaw, or any custom agent system.

## Core Problem

AI agents lose context across conversations. CLAUDE.md files grow unbounded, token budgets are wasted on stale data, and there's no structured way to manage what the agent remembers.

## Solution

3-tier memory system with token budgeting and automatic compaction via Claude API.

## API Surface

```ts
const memory = new ClawMemory({
  dbPath: './data/memory.db',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  tokenBudget: { total: 8000, tiers: 2000, history: 6000 },
})

await memory.addMessage(conversationId, { role, content })
const ctx = await memory.buildContext(conversationId)
await memory.compact(conversationId)
await memory.setTier(conversationId, 'permanent', content)
const tiers = await memory.getTiers(conversationId)
```

## Memory Tiers

| Tier | Budget | Content | Updated |
|------|--------|---------|---------|
| permanent | ~500 tokens | Stable facts, preferences, rules | Manual or via compaction |
| recent | ~1000 tokens | Summary of last 7 days | Compaction |
| decisions | ~500 tokens | Last 5 important decisions | Compaction |

## buildContext() Flow

1. Read 3 tiers from SQLite → assemble systemPrompt
2. Calculate tokens used by tiers
3. Remaining budget = total - tiers_used
4. Pull messages newest-to-oldest until budget exhausted
5. Return { systemPrompt, messages }
6. If tiers exceed budget → force compact first

## Compaction

- Model: claude-haiku-4-5-20251001 (configurable)
- Trigger: manual, cron, or auto when tiers exceed budget
- Process: read tiers + 7-day messages → Claude summarizes → atomic SQLite write
- Messages >7 days marked archived (never deleted)
- Cost: ~$0.001/day/group

## SQLite Schema

- messages: id, conversation_id, role, content, archived, created_at
- tiers: conversation_id, tier, content, updated_at (composite PK)
- token_usage: id, conversation_id, tier_tokens, history_tokens, total_tokens, created_at

## Tech Stack

- TypeScript
- better-sqlite3
- @anthropic-ai/sdk
- Zero other dependencies

## Project Structure

~8 source files, ~400-600 lines total:
- index.ts, memory-manager.ts, tiers.ts, messages.ts
- token-budget.ts, compactor.ts, db.ts, types.ts
