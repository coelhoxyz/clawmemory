import Anthropic from '@anthropic-ai/sdk'
import { createDatabase, type ClawDatabase } from './db'
import { MemoryManager } from './memory-manager'
import { MessagesStore } from './messages'
import { TiersStore } from './tiers'
import { runCompaction } from './compactor'
import type {
  ClawRecallConfig,
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

export class ClawRecall {
  private db: ClawDatabase
  private manager: MemoryManager
  private messagesStore: MessagesStore
  private tiersStore: TiersStore
  private anthropic: Anthropic
  private config: Required<ClawRecallConfig>

  constructor(userConfig: ClawRecallConfig) {
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
    const compaction = this.config.compaction as Required<NonNullable<ClawRecallConfig['compaction']>>

    const recentMessages = this.messagesStore
      .getForWindow(conversationId, compaction.windowDays)
      .map(m => ({ role: m.role, content: m.content }))

    const newTiers = await runCompaction(
      this.anthropic,
      compaction.model,
      currentTiers,
      recentMessages,
      compaction.maxDecisions
    )

    this.tiersStore.setAll(conversationId, newTiers)
    const archived = this.messagesStore.archiveOlderThan(conversationId, compaction.windowDays)

    return {
      ...newTiers,
      messagesArchived: archived,
    }
  }

  close(): void {
    this.db.close()
  }
}
