export interface ClawRecallConfig {
  dbPath: string
  anthropicApiKey: string
  tokenBudget?: TokenBudgetConfig
  compaction?: CompactionConfig
}

export interface TokenBudgetConfig {
  total?: number
  tiers?: number
  history?: number
}

export interface CompactionConfig {
  model?: string
  windowDays?: number
  maxDecisions?: number
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
