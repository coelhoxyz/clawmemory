import type { ClawDatabase } from './db'
import type { Message, TierName, BuiltContext, TokenBudgetConfig } from './types'
import { MessagesStore } from './messages'
import { TiersStore, type TierContents } from './tiers'
import { estimateTokens, fitMessagesInBudget } from './token-budget'

export const DEFAULT_BUDGET: Required<TokenBudgetConfig> = {
  total: 8000,
  tiers: 2000,
  history: 6000,
}

interface MemoryManagerDeps {
  messages: MessagesStore
  tiers: TiersStore
  budget?: Required<TokenBudgetConfig>
}

export class MemoryManager {
  readonly messages: MessagesStore
  readonly tiers: TiersStore
  private budget: Required<TokenBudgetConfig>

  constructor(deps: MemoryManagerDeps) {
    this.messages = deps.messages
    this.tiers = deps.tiers
    this.budget = deps.budget ?? DEFAULT_BUDGET
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

    const historyBudget = Math.max(0, Math.min(this.budget.history, this.budget.total - tiersTokens))
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
