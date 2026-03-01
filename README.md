# ClawMemory

Lightweight 3-tier memory and context management for AI agents.

[![npm version](https://img.shields.io/npm/v/clawmemory.svg)](https://www.npmjs.com/package/clawmemory)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

## Why ClawMemory?

AI agents lose context between conversations. As interactions grow, token budgets get wasted on stale data, and critical decisions get buried in message history. Most memory solutions are either full frameworks with heavy dependencies or cloud-based services that add latency and cost.

ClawMemory solves this with a focused, standalone library:

- **2 runtime dependencies** — just `better-sqlite3` and `@anthropic-ai/sdk`
- **Token-budget-aware** — automatically manages what fits in your context window
- **Local-first** — SQLite storage, no cloud calls needed (except optional AI compaction)
- **~$0.001/day** estimated compaction cost per conversation group using Claude Haiku

## Features

- **3-Tier Memory Architecture** — permanent facts, recent summaries, and key decisions stored separately with shared token budgets
- **Automatic Token Budgeting** — `buildContext()` returns only what fits within your configured limits (default: 8,000 tokens)
- **AI-Powered Compaction** — uses Claude Haiku to summarize and restructure memory, archiving processed messages while keeping context fresh
- **Channel-Agnostic** — works with NanoClaw, OpenClaw, LangChain, or any custom agent system
- **Zero Configuration** — sensible defaults for token budgets, compaction windows, and tier allocation
- **SQLite-Backed** — WAL mode enabled, indexed queries, no external database needed

## Install

```bash
npm install clawmemory
```

## Quick Start

```ts
import { ClawMemory } from 'clawmemory'

const memory = new ClawMemory({
  dbPath: './data/memory.db',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
})

// Store messages
memory.addMessage('user-123', { role: 'user', content: 'I prefer dark mode' })
memory.addMessage('user-123', { role: 'assistant', content: 'Noted! I will remember that.' })

// Set permanent memory
memory.setTier('user-123', 'permanent', 'User prefers dark mode. Speaks Portuguese.')

// Build optimized context within token budget
const ctx = memory.buildContext('user-123')
// ctx.systemPrompt  — tier summaries as system instructions
// ctx.messages       — recent history within token budget
// ctx.tokenUsage     — { tiers, history, total }

memory.close()
```

## API

| Method | Signature | Description |
|--------|-----------|-------------|
| `addMessage` | `(conversationId, { role, content })` | Store a message in conversation history |
| `buildContext` | `(conversationId) => BuiltContext` | Build optimized context within token budget |
| `setTier` | `(conversationId, tier, content)` | Set content for a memory tier |
| `getTiers` | `(conversationId) => { permanent, recent, decisions }` | Get all tier contents |
| `compact` | `(conversationId) => Promise<CompactionResult>` | Run AI-powered memory compaction |
| `close` | `()` | Close the database connection |

## Memory Tiers

ClawMemory organizes agent memory into three purpose-built tiers:

| Tier | Purpose | Example |
|------|---------|---------|
| `permanent` | Long-term facts, preferences, identity | "User speaks Portuguese. Prefers concise answers." |
| `recent` | Summary of recent interactions | "Last session discussed API integration options." |
| `decisions` | Key decisions and their rationale | "Chose SQLite over PostgreSQL for portability." |

All tiers share a configurable token budget (default: 2,000 tokens). Message history is managed separately within its own budget (default: 6,000 tokens).

## How Compaction Works

1. Collects messages from the configured time window (default: 7 days)
2. Sends current tier contents + recent messages to Claude Haiku for analysis
3. Claude produces updated summaries for the permanent, recent, and decisions tiers
4. Processed messages are archived (never deleted), keeping active history lean

Run compaction on a schedule (e.g., daily cron) to keep memory fresh and context windows small.

```ts
// Daily compaction — estimated cost: ~$0.001 per conversation group
await memory.compact('user-123')
```

## Configuration

```ts
const memory = new ClawMemory({
  dbPath: './data/memory.db',
  anthropicApiKey: 'sk-...',
  tokenBudget: {
    total: 8000,   // Total token budget (default: 8000)
    tiers: 2000,   // Budget for tier content (default: 2000)
    history: 6000, // Budget for message history (default: 6000)
  },
  compaction: {
    model: 'claude-haiku-4-5-20251001', // Model for compaction (default)
    windowDays: 7,                      // Days of messages to analyze (default: 7)
    maxDecisions: 5,                    // Max decisions to retain (default: 5)
  },
})
```

## Integration Example

ClawMemory works with any agent system. Here's an example with a message polling loop:

```ts
import { ClawMemory } from 'clawmemory'

const memory = new ClawMemory({
  dbPath: './data/agent-memory.db',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
})

// In your message handler
function onMessage(groupId: string, userMessage: string) {
  memory.addMessage(groupId, { role: 'user', content: userMessage })
  const ctx = memory.buildContext(groupId)
  // Use ctx.systemPrompt as the system message
  // Use ctx.messages as the conversation history
  return ctx
}

// Daily cron for memory compaction
async function dailyCompaction(groupIds: string[]) {
  for (const groupId of groupIds) {
    const result = await memory.compact(groupId)
    console.log(`[${groupId}] Archived ${result.messagesArchived} messages`)
  }
}
```

## How ClawMemory Compares

| Feature | ClawMemory | Mem0 | Letta (MemGPT) | Mastra |
|---------|-----------|------|----------------|--------|
| Language | TypeScript | Python | Python | TypeScript |
| Dependencies | 2 | Many | Many | Full framework |
| Storage | SQLite (local) | Cloud/Vector DB | PostgreSQL | Configurable |
| Token budgeting | Built-in | No | No | No |
| Tier architecture | 3-tier | Flat | 2-level | Flat |
| Standalone library | Yes | Yes | Yes | No (framework) |
| Setup required | Zero-config | API keys + infra | Server setup | Framework setup |

ClawMemory is designed for developers who want structured memory management without adopting a full framework or setting up cloud infrastructure.

## FAQ

### What problem does ClawMemory solve?

AI agents lose context between conversations and waste tokens on stale data. ClawMemory provides structured, budget-aware memory that keeps agents informed without exceeding context window limits.

### How is ClawMemory different from Mem0 or MemGPT?

ClawMemory is a lightweight TypeScript library with only 2 runtime dependencies and local SQLite storage. It focuses on token budget management and a 3-tier architecture (permanent/recent/decisions), rather than being a full memory platform or framework.

### Does ClawMemory require a cloud service?

No. ClawMemory stores everything locally in SQLite. The only optional cloud call is for AI-powered compaction, which uses Claude Haiku at an estimated cost of ~$0.001/day per conversation group.

### What AI models does ClawMemory work with?

ClawMemory is model-agnostic for context building — `buildContext()` returns a system prompt and messages that work with any LLM (Claude, GPT, Gemini, Llama, etc.). AI compaction uses Anthropic's Claude API by default.

### How much does compaction cost?

Compaction uses Claude Haiku, which processes a 7-day message window at approximately $0.001 per run. Running daily for one conversation group costs roughly $0.03/month.

### Can I use ClawMemory with LangChain or other frameworks?

Yes. ClawMemory is a standalone library. Use `buildContext()` to get a system prompt and message array, then pass them to any LLM framework or direct API call.

## Tech Stack

- **TypeScript** 5.7 with full type definitions
- **SQLite** via better-sqlite3 (WAL mode, indexed queries)
- **Anthropic SDK** for AI-powered compaction
- **Vitest** for testing
- **Node.js** >= 20

## License

[MIT](LICENSE)
