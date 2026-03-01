import { ClawRecall } from '../src'

const memory = new ClawRecall({
  dbPath: './data/memory.db',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
})

// Store messages
memory.addMessage('user-123', { role: 'user', content: 'I prefer dark mode' })
memory.addMessage('user-123', { role: 'assistant', content: 'Noted! I will remember that.' })

// Set permanent memory
memory.setTier('user-123', 'permanent', 'User prefers dark mode. Speaks Portuguese.')

// Build optimized context for your agent
const ctx = memory.buildContext('user-123')
console.log('System prompt:', ctx.systemPrompt)
console.log('Messages:', ctx.messages.length)
console.log('Token usage:', ctx.tokenUsage)

// Compact memory (run daily via cron)
// await memory.compact('user-123')

memory.close()
