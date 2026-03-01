import type { ClawDatabase } from './db'
import type { Message, StoredMessage } from './types'

export class MessagesStore {
  constructor(private db: ClawDatabase) {}

  add(conversationId: string, message: Message): void {
    this.db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    ).run(conversationId, message.role, message.content)
  }

  getRecent(conversationId: string, limit = 500): StoredMessage[] {
    return this.db.prepare(
      `SELECT id, conversation_id as conversationId, role, content, archived, created_at as createdAt
       FROM messages
       WHERE conversation_id = ? AND archived = 0
       ORDER BY created_at ASC
       LIMIT ?`
    ).all(conversationId, limit) as StoredMessage[]
  }

  getForWindow(conversationId: string, days: number): StoredMessage[] {
    return this.db.prepare(
      `SELECT id, conversation_id as conversationId, role, content, archived, created_at as createdAt
       FROM messages
       WHERE conversation_id = ? AND archived = 0
         AND created_at >= datetime('now', ?)
       ORDER BY created_at ASC`
    ).all(conversationId, `-${days} days`) as StoredMessage[]
  }

  archiveOlderThan(conversationId: string, days: number): number {
    const result = this.db.prepare(
      `UPDATE messages SET archived = 1
       WHERE conversation_id = ? AND archived = 0
         AND created_at <= datetime('now', ?)`
    ).run(conversationId, `-${days} days`)
    return result.changes
  }
}
