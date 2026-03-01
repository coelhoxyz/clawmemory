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
