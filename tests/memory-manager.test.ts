import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, type ClawDatabase } from '../src/db'
import { MemoryManager } from '../src/memory-manager'
import { MessagesStore } from '../src/messages'
import { TiersStore } from '../src/tiers'

describe('MemoryManager', () => {
  let db: ClawDatabase
  let manager: MemoryManager

  beforeEach(() => {
    db = createDatabase(':memory:')
    manager = new MemoryManager({
      messages: new MessagesStore(db),
      tiers: new TiersStore(db),
      budget: { total: 8000, tiers: 2000, history: 6000 },
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
