# ClawMemory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone TypeScript library for managing AI agent context with 3-tier memory, token budgeting, and automatic compaction via Claude API.

**Architecture:** SQLite stores raw messages and structured memory tiers. A token budget system controls how much context is assembled per request. Compaction uses Claude Haiku to summarize and restructure memory when it exceeds budget limits.

**Tech Stack:** TypeScript, better-sqlite3, @anthropic-ai/sdk, vitest for testing

---

### Task 1: Project scaffold and dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/index.ts`

**Step 1: Initialize project**

Run: `cd /Users/coelhoxyz/dev/projects/huntly/apps/clawmemory && git init`

**Step 2: Create package.json**

```json
{
  "name": "clawmemory",
  "version": "0.1.0",
  "description": "3-tier memory and context management for AI agents",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": ["ai", "memory", "context", "nanoclaw", "openclaw", "agents"],
  "license": "MIT",
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "better-sqlite3": "^11.8.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
*.db
.DS_Store
```

**Step 5: Create empty entry point**

Create `src/index.ts`:
```ts
export {}
```

**Step 6: Install dependencies**

Run: `npm install`

**Step 7: Verify setup compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 8: Commit**

```bash
git add package.json tsconfig.json .gitignore src/index.ts
git commit -m "chore: scaffold clawmemory project"
```

---

### Task 2: Types

**Files:**
- Create: `src/types.ts`

**Step 1: Create types file**

```ts
export interface ClawMemoryConfig {
  dbPath: string
  anthropicApiKey: string
  tokenBudget?: TokenBudgetConfig
  compaction?: CompactionConfig
}

export interface TokenBudgetConfig {
  total?: number      // default 8000
  tiers?: number      // default 2000
  history?: number    // default 6000
}

export interface CompactionConfig {
  model?: string       // default 'claude-haiku-4-5-20251001'
  windowDays?: number  // default 7
  maxDecisions?: number // default 5
}

export type TierName = 'permanent' | 'recent' | 'decisions'

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StoredMessage extends Message {
  id: number
  conversationId: string
  archived: boolean
  createdAt: string
}

export interface TierData {
  conversationId: string
  tier: TierName
  content: string
  updatedAt: string
}

export interface BuiltContext {
  systemPrompt: string
  messages: Message[]
  tokenUsage: {
    tiers: number
    history: number
    total: number
  }
}

export interface CompactionResult {
  permanent: string
  recent: string
  decisions: string
  messagesArchived: number
}
```

**Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add type definitions"
```

---

### Task 3: Token budget estimator

**Files:**
- Create: `src/token-budget.ts`
- Create: `tests/token-budget.test.ts`

**Step 1: Write the failing test**

Create `tests/token-budget.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { estimateTokens, fitMessagesInBudget } from '../src/token-budget'

describe('estimateTokens', () => {
  it('estimates tokens from text length', () => {
    const result = estimateTokens('hello world') // 11 chars
    expect(result).toBe(3) // ceil(11/4)
  })

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })
})

describe('fitMessagesInBudget', () => {
  it('returns all messages when within budget', () => {
    const messages = [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, content: 'hello' },
    ]
    const result = fitMessagesInBudget(messages, 1000)
    expect(result.messages).toHaveLength(2)
    expect(result.tokensUsed).toBeGreaterThan(0)
  })

  it('truncates oldest messages when over budget', () => {
    const messages = [
      { role: 'user' as const, content: 'a'.repeat(400) },
      { role: 'user' as const, content: 'b'.repeat(400) },
      { role: 'assistant' as const, content: 'c'.repeat(400) },
    ]
    const result = fitMessagesInBudget(messages, 150)
    expect(result.messages.length).toBeLessThan(3)
    expect(result.messages[result.messages.length - 1].content).toContain('c')
  })

  it('returns empty array when budget is 0', () => {
    const messages = [{ role: 'user' as const, content: 'hi' }]
    const result = fitMessagesInBudget(messages, 0)
    expect(result.messages).toHaveLength(0)
    expect(result.tokensUsed).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/token-budget.test.ts`
Expected: FAIL — module not found.

**Step 3: Write implementation**

Create `src/token-budget.ts`:
```ts
import type { Message } from './types'

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export function fitMessagesInBudget(
  messages: Message[],
  budget: number
): { messages: Message[]; tokensUsed: number } {
  if (budget <= 0) return { messages: [], tokensUsed: 0 }

  const selected: Message[] = []
  let tokensUsed = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateTokens(messages[i].content) + estimateTokens(messages[i].role)
    if (tokensUsed + cost > budget) break
    selected.unshift(messages[i])
    tokensUsed += cost
  }

  return { messages: selected, tokensUsed }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/token-budget.test.ts`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/token-budget.ts tests/token-budget.test.ts
git commit -m "feat: add token budget estimator with tests"
```

---

### Task 4: Database layer

**Files:**
- Create: `src/db.ts`
- Create: `tests/db.test.ts`

**Step 1: Write the failing test**

Create `tests/db.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, type ClawDatabase } from '../src/db'
import { unlinkSync } from 'fs'

const TEST_DB = '/tmp/clawmemory-test-db.db'

describe('createDatabase', () => {
  let db: ClawDatabase

  beforeEach(() => {
    db = createDatabase(TEST_DB)
  })

  afterEach(() => {
    db.close()
    try { unlinkSync(TEST_DB) } catch {}
  })

  it('creates tables on init', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('messages')
    expect(names).toContain('tiers')
    expect(names).toContain('token_usage')
  })

  it('creates indexes', () => {
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    ).all() as { name: string }[]
    const names = indexes.map(i => i.name)
    expect(names).toContain('idx_messages_conv')
    expect(names).toContain('idx_usage_conv')
  })

  it('supports :memory: for testing', () => {
    const memDb = createDatabase(':memory:')
    const tables = memDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[]
    expect(tables.length).toBeGreaterThan(0)
    memDb.close()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — module not found.

**Step 3: Write implementation**

Create `src/db.ts`:
```ts
import Database from 'better-sqlite3'

export type ClawDatabase = Database.Database

export function createDatabase(dbPath: string): ClawDatabase {
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      archived INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tiers (
      conversation_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (conversation_id, tier)
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      tier_tokens INTEGER,
      history_tokens INTEGER,
      total_tokens INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv
      ON messages(conversation_id, archived, created_at);

    CREATE INDEX IF NOT EXISTS idx_usage_conv
      ON token_usage(conversation_id, created_at);
  `)

  return db
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db.test.ts`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/db.ts tests/db.test.ts
git commit -m "feat: add SQLite database layer with schema"
```

---

### Task 5: Messages CRUD

**Files:**
- Create: `src/messages.ts`
- Create: `tests/messages.test.ts`

**Step 1: Write the failing test**

Create `tests/messages.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, type ClawDatabase } from '../src/db'
import { MessagesStore } from '../src/messages'

describe('MessagesStore', () => {
  let db: ClawDatabase
  let store: MessagesStore

  beforeEach(() => {
    db = createDatabase(':memory:')
    store = new MessagesStore(db)
  })

  afterEach(() => {
    db.close()
  })

  it('adds and retrieves messages', () => {
    store.add('conv-1', { role: 'user', content: 'hello' })
    store.add('conv-1', { role: 'assistant', content: 'hi there' })

    const messages = store.getRecent('conv-1')
    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe('hello')
    expect(messages[1].content).toBe('hi there')
  })

  it('isolates conversations', () => {
    store.add('conv-1', { role: 'user', content: 'hello' })
    store.add('conv-2', { role: 'user', content: 'world' })

    expect(store.getRecent('conv-1')).toHaveLength(1)
    expect(store.getRecent('conv-2')).toHaveLength(1)
  })

  it('excludes archived messages from getRecent', () => {
    store.add('conv-1', { role: 'user', content: 'old' })
    store.add('conv-1', { role: 'user', content: 'new' })
    store.archiveOlderThan('conv-1', 0)

    expect(store.getRecent('conv-1')).toHaveLength(0)
  })

  it('getForWindow returns messages within day window', () => {
    store.add('conv-1', { role: 'user', content: 'recent' })
    const messages = store.getForWindow('conv-1', 7)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('recent')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/messages.test.ts`
Expected: FAIL — module not found.

**Step 3: Write implementation**

Create `src/messages.ts`:
```ts
import type { ClawDatabase } from './db'
import type { Message, StoredMessage } from './types'

export class MessagesStore {
  constructor(private db: ClawDatabase) {}

  add(conversationId: string, message: Message): void {
    this.db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    ).run(conversationId, message.role, message.content)
  }

  getRecent(conversationId: string, limit = 500): StoredMessage[] {
    return this.db.prepare(
      `SELECT id, conversation_id as conversationId, role, content, archived, created_at as createdAt
       FROM messages
       WHERE conversation_id = ? AND archived = 0
       ORDER BY created_at ASC
       LIMIT ?`
    ).all(conversationId, limit) as StoredMessage[]
  }

  getForWindow(conversationId: string, days: number): StoredMessage[] {
    return this.db.prepare(
      `SELECT id, conversation_id as conversationId, role, content, archived, created_at as createdAt
       FROM messages
       WHERE conversation_id = ? AND archived = 0
         AND created_at >= datetime('now', ?)
       ORDER BY created_at ASC`
    ).all(conversationId, `-${days} days`) as StoredMessage[]
  }

  archiveOlderThan(conversationId: string, days: number): number {
    const result = this.db.prepare(
      `UPDATE messages SET archived = 1
       WHERE conversation_id = ? AND archived = 0
         AND created_at < datetime('now', ?)`
    ).run(conversationId, `-${days} days`)
    return result.changes
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/messages.test.ts`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/messages.ts tests/messages.test.ts
git commit -m "feat: add messages store with CRUD and archiving"
```

---

### Task 6: Tiers CRUD

**Files:**
- Create: `src/tiers.ts`
- Create: `tests/tiers.test.ts`

**Step 1: Write the failing test**

Create `tests/tiers.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, type ClawDatabase } from '../src/db'
import { TiersStore } from '../src/tiers'

describe('TiersStore', () => {
  let db: ClawDatabase
  let store: TiersStore

  beforeEach(() => {
    db = createDatabase(':memory:')
    store = new TiersStore(db)
  })

  afterEach(() => {
    db.close()
  })

  it('sets and gets a tier', () => {
    store.set('conv-1', 'permanent', 'User prefers PT-BR')
    const tiers = store.getAll('conv-1')
    expect(tiers.permanent).toBe('User prefers PT-BR')
  })

  it('upserts existing tier', () => {
    store.set('conv-1', 'permanent', 'old')
    store.set('conv-1', 'permanent', 'new')
    const tiers = store.getAll('conv-1')
    expect(tiers.permanent).toBe('new')
  })

  it('returns empty strings for missing tiers', () => {
    const tiers = store.getAll('conv-1')
    expect(tiers.permanent).toBe('')
    expect(tiers.recent).toBe('')
    expect(tiers.decisions).toBe('')
  })

  it('isolates conversations', () => {
    store.set('conv-1', 'permanent', 'one')
    store.set('conv-2', 'permanent', 'two')
    expect(store.getAll('conv-1').permanent).toBe('one')
    expect(store.getAll('conv-2').permanent).toBe('two')
  })

  it('setAll writes all tiers atomically', () => {
    store.setAll('conv-1', {
      permanent: 'facts',
      recent: 'summary',
      decisions: 'choices',
    })
    const tiers = store.getAll('conv-1')
    expect(tiers.permanent).toBe('facts')
    expect(tiers.recent).toBe('summary')
    expect(tiers.decisions).toBe('choices')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tiers.test.ts`
Expected: FAIL — module not found.

**Step 3: Write implementation**

Create `src/tiers.ts`:
```ts
import type { ClawDatabase } from './db'
import type { TierName } from './types'

export interface TierContents {
  permanent: string
  recent: string
  decisions: string
}

export class TiersStore {
  constructor(private db: ClawDatabase) {}

  set(conversationId: string, tier: TierName, content: string): void {
    this.db.prepare(
      `INSERT INTO tiers (conversation_id, tier, content, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(conversation_id, tier)
       DO UPDATE SET content = excluded.content, updated_at = datetime('now')`
    ).run(conversationId, tier, content)
  }

  getAll(conversationId: string): TierContents {
    const rows = this.db.prepare(
      'SELECT tier, content FROM tiers WHERE conversation_id = ?'
    ).all(conversationId) as { tier: TierName; content: string }[]

    const result: TierContents = { permanent: '', recent: '', decisions: '' }
    for (const row of rows) {
      result[row.tier] = row.content
    }
    return result
  }

  setAll(conversationId: string, contents: TierContents): void {
    const upsert = this.db.prepare(
      `INSERT INTO tiers (conversation_id, tier, content, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(conversation_id, tier)
       DO UPDATE SET content = excluded.content, updated_at = datetime('now')`
    )

    const transaction = this.db.transaction(() => {
      upsert.run(conversationId, 'permanent', contents.permanent)
      upsert.run(conversationId, 'recent', contents.recent)
      upsert.run(conversationId, 'decisions', contents.decisions)
    })

    transaction()
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tiers.test.ts`
Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/tiers.ts tests/tiers.test.ts
git commit -m "feat: add tiers store with atomic setAll"
```

---

### Task 7: Compactor

**Files:**
- Create: `src/compactor.ts`
- Create: `tests/compactor.test.ts`

**Step 1: Write the failing test**

Create `tests/compactor.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildCompactionPrompt, parseCompactionResponse } from '../src/compactor'

describe('buildCompactionPrompt', () => {
  it('includes current tiers and messages in prompt', () => {
    const prompt = buildCompactionPrompt(
      { permanent: 'likes coffee', recent: 'talked about deploy', decisions: 'chose postgres' },
      [
        { role: 'user', content: 'lets use redis instead' },
        { role: 'assistant', content: 'ok, switching to redis' },
      ],
      5
    )
    expect(prompt).toContain('likes coffee')
    expect(prompt).toContain('lets use redis instead')
    expect(prompt).toContain('5')
  })
})

describe('parseCompactionResponse', () => {
  it('parses markdown with 3 tier sections', () => {
    const response = `## Permanent
User is a dev who likes coffee

## Recent
Discussed switching from postgres to redis for caching

## Decisions
1. Switch to redis for caching
2. Deploy on Cloudflare`

    const result = parseCompactionResponse(response)
    expect(result.permanent).toContain('coffee')
    expect(result.recent).toContain('redis')
    expect(result.decisions).toContain('Cloudflare')
  })

  it('handles missing sections gracefully', () => {
    const response = `## Permanent
Some facts`

    const result = parseCompactionResponse(response)
    expect(result.permanent).toContain('facts')
    expect(result.recent).toBe('')
    expect(result.decisions).toBe('')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compactor.test.ts`
Expected: FAIL — module not found.

**Step 3: Write implementation**

Create `src/compactor.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk'
import type { Message } from './types'
import type { TierContents } from './tiers'

export function buildCompactionPrompt(
  currentTiers: TierContents,
  recentMessages: Message[],
  maxDecisions: number
): string {
  const messagesText = recentMessages
    .map(m => `[${m.role}]: ${m.content}`)
    .join('\n')

  return `You are a memory compaction system. Rewrite the agent's memory into exactly 3 sections.

CURRENT MEMORY:
## Permanent
${currentTiers.permanent || '(empty)'}

## Recent
${currentTiers.recent || '(empty)'}

## Decisions
${currentTiers.decisions || '(empty)'}

RECENT MESSAGES:
${messagesText || '(no recent messages)'}

INSTRUCTIONS:
Rewrite the memory with these exact 3 markdown sections:
- ## Permanent — stable facts about the user (preferences, profile, rules). Keep only what is confirmed true. Max 100 words.
- ## Recent — summary of recent conversations. Focus on what matters for future context. Max 200 words.
- ## Decisions — the ${maxDecisions} most important recent decisions or conclusions. Numbered list.

Output ONLY the 3 sections, no other text.`
}

export function parseCompactionResponse(response: string): TierContents {
  const sections: TierContents = { permanent: '', recent: '', decisions: '' }

  const tierPatterns: [keyof TierContents, RegExp][] = [
    ['permanent', /## Permanent\n([\s\S]*?)(?=## |$)/i],
    ['recent', /## Recent\n([\s\S]*?)(?=## |$)/i],
    ['decisions', /## Decisions\n([\s\S]*?)(?=## |$)/i],
  ]

  for (const [tier, pattern] of tierPatterns) {
    const match = response.match(pattern)
    if (match) {
      sections[tier] = match[1].trim()
    }
  }

  return sections
}

export async function runCompaction(
  client: Anthropic,
  model: string,
  currentTiers: TierContents,
  recentMessages: Message[],
  maxDecisions: number
): Promise<TierContents> {
  const prompt = buildCompactionPrompt(currentTiers, recentMessages, maxDecisions)

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')

  return parseCompactionResponse(text)
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/compactor.test.ts`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/compactor.ts tests/compactor.test.ts
git commit -m "feat: add compactor with prompt builder and response parser"
```

---

### Task 8: MemoryManager (core orchestrator)

**Files:**
- Create: `src/memory-manager.ts`
- Create: `tests/memory-manager.test.ts`

**Step 1: Write the failing test**

Create `tests/memory-manager.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, type ClawDatabase } from '../src/db'
import { MemoryManager } from '../src/memory-manager'

describe('MemoryManager', () => {
  let db: ClawDatabase
  let manager: MemoryManager

  beforeEach(() => {
    db = createDatabase(':memory:')
    manager = new MemoryManager(db, {
      tokenBudget: { total: 8000, tiers: 2000, history: 6000 },
    })
  })

  afterEach(() => {
    db.close()
  })

  it('adds messages and builds context', () => {
    manager.addMessage('conv-1', { role: 'user', content: 'hello' })
    manager.addMessage('conv-1', { role: 'assistant', content: 'hi' })

    const ctx = manager.buildContext('conv-1')
    expect(ctx.messages).toHaveLength(2)
    expect(ctx.systemPrompt).toBeDefined()
    expect(ctx.tokenUsage.total).toBeGreaterThan(0)
  })

  it('includes tiers in systemPrompt', () => {
    manager.setTier('conv-1', 'permanent', 'User is a Python dev')
    const ctx = manager.buildContext('conv-1')
    expect(ctx.systemPrompt).toContain('Python dev')
  })

  it('respects history token budget', () => {
    for (let i = 0; i < 100; i++) {
      manager.addMessage('conv-1', { role: 'user', content: 'x'.repeat(400) })
    }
    const ctx = manager.buildContext('conv-1')
    expect(ctx.messages.length).toBeLessThan(100)
    expect(ctx.tokenUsage.history).toBeLessThanOrEqual(6000)
  })

  it('getTiers returns all tiers', () => {
    manager.setTier('conv-1', 'permanent', 'fact')
    manager.setTier('conv-1', 'recent', 'summary')
    const tiers = manager.getTiers('conv-1')
    expect(tiers.permanent).toBe('fact')
    expect(tiers.recent).toBe('summary')
  })

  it('assembles systemPrompt from tiers in correct order', () => {
    manager.setTier('conv-1', 'permanent', 'PERM_CONTENT')
    manager.setTier('conv-1', 'recent', 'RECENT_CONTENT')
    manager.setTier('conv-1', 'decisions', 'DECISION_CONTENT')

    const ctx = manager.buildContext('conv-1')
    const permIdx = ctx.systemPrompt.indexOf('PERM_CONTENT')
    const recentIdx = ctx.systemPrompt.indexOf('RECENT_CONTENT')
    const decisionIdx = ctx.systemPrompt.indexOf('DECISION_CONTENT')

    expect(permIdx).toBeLessThan(recentIdx)
    expect(recentIdx).toBeLessThan(decisionIdx)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/memory-manager.test.ts`
Expected: FAIL — module not found.

**Step 3: Write implementation**

Create `src/memory-manager.ts`:
```ts
import type { ClawDatabase } from './db'
import type { Message, TierName, BuiltContext, TokenBudgetConfig } from './types'
import { MessagesStore } from './messages'
import { TiersStore, type TierContents } from './tiers'
import { estimateTokens, fitMessagesInBudget } from './token-budget'

interface MemoryManagerOptions {
  tokenBudget: Required<TokenBudgetConfig>
}

const DEFAULT_BUDGET: Required<TokenBudgetConfig> = {
  total: 8000,
  tiers: 2000,
  history: 6000,
}

export class MemoryManager {
  private messages: MessagesStore
  private tiers: TiersStore
  private budget: Required<TokenBudgetConfig>

  constructor(db: ClawDatabase, options?: Partial<MemoryManagerOptions>) {
    this.messages = new MessagesStore(db)
    this.tiers = new TiersStore(db)
    this.budget = { ...DEFAULT_BUDGET, ...options?.tokenBudget }
  }

  addMessage(conversationId: string, message: Message): void {
    this.messages.add(conversationId, message)
  }

  setTier(conversationId: string, tier: TierName, content: string): void {
    this.tiers.set(conversationId, tier, content)
  }

  getTiers(conversationId: string): TierContents {
    return this.tiers.getAll(conversationId)
  }

  buildContext(conversationId: string): BuiltContext {
    const tierContents = this.tiers.getAll(conversationId)
    const systemPrompt = this.buildSystemPrompt(tierContents)
    const tiersTokens = estimateTokens(systemPrompt)

    const historyBudget = Math.max(0, this.budget.total - tiersTokens)
    const recentMessages = this.messages.getRecent(conversationId)
    const { messages, tokensUsed: historyTokens } = fitMessagesInBudget(
      recentMessages.map(m => ({ role: m.role, content: m.content })),
      historyBudget
    )

    return {
      systemPrompt,
      messages,
      tokenUsage: {
        tiers: tiersTokens,
        history: historyTokens,
        total: tiersTokens + historyTokens,
      },
    }
  }

  private buildSystemPrompt(tiers: TierContents): string {
    const sections: string[] = []

    if (tiers.permanent) {
      sections.push(`## Permanent\n${tiers.permanent}`)
    }
    if (tiers.recent) {
      sections.push(`## Recent\n${tiers.recent}`)
    }
    if (tiers.decisions) {
      sections.push(`## Decisions\n${tiers.decisions}`)
    }

    return sections.join('\n\n')
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/memory-manager.test.ts`
Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/memory-manager.ts tests/memory-manager.test.ts
git commit -m "feat: add memory manager with context building and budget control"
```

---

### Task 9: ClawMemory facade (public API)

**Files:**
- Create: `src/clawmemory.ts`
- Update: `src/index.ts`
- Create: `tests/clawmemory.test.ts`

**Step 1: Write the failing test**

Create `tests/clawmemory.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { ClawMemory } from '../src/clawmemory'

describe('ClawMemory', () => {
  let memory: ClawMemory

  afterEach(() => {
    memory?.close()
  })

  it('initializes with in-memory database', () => {
    memory = new ClawMemory({
      dbPath: ':memory:',
      anthropicApiKey: 'test-key',
    })
    expect(memory).toBeDefined()
  })

  it('full flow: add messages, set tiers, build context', () => {
    memory = new ClawMemory({
      dbPath: ':memory:',
      anthropicApiKey: 'test-key',
    })

    memory.addMessage('conv-1', { role: 'user', content: 'hello world' })
    memory.setTier('conv-1', 'permanent', 'User speaks Portuguese')

    const ctx = memory.buildContext('conv-1')
    expect(ctx.systemPrompt).toContain('Portuguese')
    expect(ctx.messages).toHaveLength(1)
    expect(ctx.messages[0].content).toBe('hello world')
  })

  it('applies default token budgets', () => {
    memory = new ClawMemory({
      dbPath: ':memory:',
      anthropicApiKey: 'test-key',
    })

    memory.addMessage('conv-1', { role: 'user', content: 'hi' })
    const ctx = memory.buildContext('conv-1')
    expect(ctx.tokenUsage.total).toBeGreaterThan(0)
  })

  it('accepts custom token budgets', () => {
    memory = new ClawMemory({
      dbPath: ':memory:',
      anthropicApiKey: 'test-key',
      tokenBudget: { total: 500, tiers: 100, history: 400 },
    })

    for (let i = 0; i < 50; i++) {
      memory.addMessage('conv-1', { role: 'user', content: 'x'.repeat(200) })
    }
    const ctx = memory.buildContext('conv-1')
    expect(ctx.tokenUsage.history).toBeLessThanOrEqual(400)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/clawmemory.test.ts`
Expected: FAIL — module not found.

**Step 3: Write ClawMemory facade**

Create `src/clawmemory.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk'
import { createDatabase, type ClawDatabase } from './db'
import { MemoryManager } from './memory-manager'
import { MessagesStore } from './messages'
import { TiersStore } from './tiers'
import { runCompaction } from './compactor'
import type {
  ClawMemoryConfig,
  Message,
  TierName,
  BuiltContext,
  CompactionResult,
  TokenBudgetConfig,
} from './types'

const DEFAULT_BUDGET: Required<TokenBudgetConfig> = {
  total: 8000,
  tiers: 2000,
  history: 6000,
}

export class ClawMemory {
  private db: ClawDatabase
  private manager: MemoryManager
  private messagesStore: MessagesStore
  private tiersStore: TiersStore
  private anthropic: Anthropic
  private config: Required<ClawMemoryConfig>

  constructor(userConfig: ClawMemoryConfig) {
    this.config = {
      dbPath: userConfig.dbPath,
      anthropicApiKey: userConfig.anthropicApiKey,
      tokenBudget: { ...DEFAULT_BUDGET, ...userConfig.tokenBudget },
      compaction: {
        model: userConfig.compaction?.model ?? 'claude-haiku-4-5-20251001',
        windowDays: userConfig.compaction?.windowDays ?? 7,
        maxDecisions: userConfig.compaction?.maxDecisions ?? 5,
      },
    }

    this.db = createDatabase(this.config.dbPath)
    this.messagesStore = new MessagesStore(this.db)
    this.tiersStore = new TiersStore(this.db)
    this.manager = new MemoryManager(this.db, {
      tokenBudget: this.config.tokenBudget as Required<TokenBudgetConfig>,
    })
    this.anthropic = new Anthropic({ apiKey: this.config.anthropicApiKey })
  }

  addMessage(conversationId: string, message: Message): void {
    this.manager.addMessage(conversationId, message)
  }

  buildContext(conversationId: string): BuiltContext {
    return this.manager.buildContext(conversationId)
  }

  setTier(conversationId: string, tier: TierName, content: string): void {
    this.manager.setTier(conversationId, tier, content)
  }

  getTiers(conversationId: string) {
    return this.manager.getTiers(conversationId)
  }

  async compact(conversationId: string): Promise<CompactionResult> {
    const currentTiers = this.tiersStore.getAll(conversationId)
    const { windowDays, maxDecisions, model } = this.config.compaction

    const recentMessages = this.messagesStore
      .getForWindow(conversationId, windowDays)
      .map(m => ({ role: m.role, content: m.content }))

    const newTiers = await runCompaction(
      this.anthropic,
      model,
      currentTiers,
      recentMessages,
      maxDecisions
    )

    this.tiersStore.setAll(conversationId, newTiers)
    const archived = this.messagesStore.archiveOlderThan(conversationId, windowDays)

    return {
      ...newTiers,
      messagesArchived: archived,
    }
  }

  close(): void {
    this.db.close()
  }
}
```

**Step 4: Update index.ts to export everything**

Update `src/index.ts`:
```ts
export { ClawMemory } from './clawmemory'
export type {
  ClawMemoryConfig,
  TokenBudgetConfig,
  CompactionConfig,
  TierName,
  Message,
  StoredMessage,
  BuiltContext,
  CompactionResult,
} from './types'
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/clawmemory.test.ts`
Expected: All 4 tests PASS.

**Step 6: Run all tests to verify nothing broke**

Run: `npx vitest run`
Expected: All tests PASS across all files.

**Step 7: Build to verify TypeScript compiles**

Run: `npx tsc`
Expected: No errors, `dist/` created.

**Step 8: Commit**

```bash
git add src/clawmemory.ts src/index.ts tests/clawmemory.test.ts
git commit -m "feat: add ClawMemory facade with compaction support"
```

---

### Task 10: Examples and README

**Files:**
- Create: `examples/basic-usage.ts`
- Create: `examples/nanoclaw-integration.ts`
- Create: `README.md`
- Create: `LICENSE`

**Step 1: Create basic usage example**

Create `examples/basic-usage.ts` with: ClawMemory init, addMessage, setTier, buildContext, and compact usage.

**Step 2: Create NanoClaw integration example**

Create `examples/nanoclaw-integration.ts` with: how to integrate ClawMemory into NanoClaw's polling loop, writing optimized CLAUDE.md, and daily cron compaction.

**Step 3: Create MIT LICENSE**

Standard MIT license, copyright 2026 Huntly.

**Step 4: Create README.md**

Include: project description, install instructions, quick start code, API reference table, NanoClaw integration section, configuration options, and license.

**Step 5: Commit**

```bash
git add examples/ LICENSE README.md
git commit -m "docs: add examples, README, and MIT license"
```

---

### Task 11: Final verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

**Step 2: Build**

Run: `npx tsc`
Expected: Clean build, no errors.

**Step 3: Verify exports**

Run: `node -e "const m = require('./dist'); console.log(Object.keys(m))"`
Expected: `['ClawMemory']`
