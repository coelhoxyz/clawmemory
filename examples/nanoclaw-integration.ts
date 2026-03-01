/**
 * Example: Integrating ClawRecall with NanoClaw
 *
 * In NanoClaw's polling loop, before dispatching to the container,
 * use ClawRecall to build an optimized context.
 */
import { ClawRecall } from '../src'

const memory = new ClawRecall({
  dbPath: './data/nanoclaw-memory.db',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  tokenBudget: {
    total: 8000,
    tiers: 2000,
    history: 6000,
  },
  compaction: {
    model: 'claude-haiku-4-5-20251001',
    windowDays: 7,
    maxDecisions: 5,
  },
})

// Simulating NanoClaw's message flow
function onMessage(groupId: string, userMessage: string) {
  // 1. Store the incoming message
  memory.addMessage(groupId, { role: 'user', content: userMessage })

  // 2. Build optimized context
  const ctx = memory.buildContext(groupId)

  // 3. Pass to NanoClaw's container dispatch
  // In real integration, write ctx.systemPrompt to the group's CLAUDE.md
  // and pass ctx.messages as the conversation history
  console.log(`[${groupId}] Context built:`, {
    systemPromptTokens: ctx.tokenUsage.tiers,
    historyMessages: ctx.messages.length,
    totalTokens: ctx.tokenUsage.total,
  })

  return ctx
}

// Simulating cron compaction
async function dailyCompaction(groupIds: string[]) {
  for (const groupId of groupIds) {
    const result = await memory.compact(groupId)
    console.log(`[${groupId}] Compacted:`, {
      archived: result.messagesArchived,
    })
  }
}

// Usage
onMessage('group-whatsapp-1', 'Quero fazer deploy no Cloudflare')
