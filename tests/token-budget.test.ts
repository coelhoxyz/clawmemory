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
