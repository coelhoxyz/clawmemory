import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, type ClawDatabase } from '../src/db'
import { MessagesStore } from '../src/messages'

describe('MessagesStore', () => {
  let db: ClawDatabase
  let store: MessagesStore

  beforeEach(() => {
    db = createDatabase(':memory:')
    store = new MessagesStore(db)
  })

  afterEach(() => {
    db.close()
  })

  it('adds and retrieves messages', () => {
    store.add('conv-1', { role: 'user', content: 'hello' })
    store.add('conv-1', { role: 'assistant', content: 'hi there' })

    const messages = store.getRecent('conv-1')
    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe('hello')
    expect(messages[1].content).toBe('hi there')
  })

  it('isolates conversations', () => {
    store.add('conv-1', { role: 'user', content: 'hello' })
    store.add('conv-2', { role: 'user', content: 'world' })

    expect(store.getRecent('conv-1')).toHaveLength(1)
    expect(store.getRecent('conv-2')).toHaveLength(1)
  })

  it('excludes archived messages from getRecent', () => {
    store.add('conv-1', { role: 'user', content: 'old' })
    store.add('conv-1', { role: 'user', content: 'new' })
    store.archiveOlderThan('conv-1', 0)

    expect(store.getRecent('conv-1')).toHaveLength(0)
  })

  it('getForWindow returns messages within day window', () => {
    store.add('conv-1', { role: 'user', content: 'recent' })
    const messages = store.getForWindow('conv-1', 7)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('recent')
  })
})
