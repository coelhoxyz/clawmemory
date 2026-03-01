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
