import Anthropic from '@anthropic-ai/sdk'
import { createDatabase, type ClawDatabase } from './db'
import { MemoryManager, DEFAULT_BUDGET } from './memory-manager'
import { MessagesStore } from './messages'
import { TiersStore, type TierContents } from './tiers'
import { runCompaction } from './compactor'
import type {
  ClawRecallConfig,
  CompactionConfig,
  Message,
  TierName,
  BuiltContext,
  CompactionResult,
  TokenBudgetConfig,
} from './types'

const DEFAULT_COMPACTION: Required<CompactionConfig> = {
  model: 'claude-haiku-4-5-20251001',
  windowDays: 7,
  maxDecisions: 5,
}

export class ClawRecall {
  private db: ClawDatabase
  private manager: MemoryManager
  private messagesStore: MessagesStore
  private tiersStore: TiersStore
  private anthropic: Anthropic
  private compactionConfig: Required<CompactionConfig>

  constructor(userConfig: ClawRecallConfig) {
    const budget: Required<TokenBudgetConfig> = { ...DEFAULT_BUDGET, ...userConfig.tokenBudget }
    this.compactionConfig = { ...DEFAULT_COMPACTION, ...userConfig.compaction }

    this.db = createDatabase(userConfig.dbPath)
    this.messagesStore = new MessagesStore(this.db)
    this.tiersStore = new TiersStore(this.db)
    this.manager = new MemoryManager({
      messages: this.messagesStore,
      tiers: this.tiersStore,
      budget,
    })
    this.anthropic = new Anthropic({ apiKey: userConfig.anthropicApiKey })
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

  getTiers(conversationId: string): TierContents {
    return this.manager.getTiers(conversationId)
  }

  async compact(conversationId: string): Promise<CompactionResult> {
    const currentTiers = this.tiersStore.getAll(conversationId)

    const recentMessages = this.messagesStore
      .getForWindow(conversationId, this.compactionConfig.windowDays)
      .map(m => ({ role: m.role, content: m.content }))

    const newTiers = await runCompaction(
      this.anthropic,
      this.compactionConfig.model,
      currentTiers,
      recentMessages,
      this.compactionConfig.maxDecisions
    )

    this.tiersStore.setAll(conversationId, newTiers)
    const archived = this.messagesStore.archiveOlderThan(conversationId, this.compactionConfig.windowDays)

    return {
      ...newTiers,
      messagesArchived: archived,
    }
  }

  close(): void {
    this.db.close()
  }
}
