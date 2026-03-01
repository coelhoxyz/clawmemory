import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, type ClawDatabase } from '../src/db'
import { unlinkSync } from 'fs'

const TEST_DB = '/tmp/clawrecall-test-db.db'

describe('createDatabase', () => {
  let db: ClawDatabase

  beforeEach(() => {
    db = createDatabase(TEST_DB)
  })

  afterEach(() => {
    db.close()
    try { unlinkSync(TEST_DB) } catch {}
  })

  it('creates tables on init', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('messages')
    expect(names).toContain('tiers')
    expect(names).toContain('token_usage')
  })

  it('creates indexes', () => {
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    ).all() as { name: string }[]
    const names = indexes.map(i => i.name)
    expect(names).toContain('idx_messages_conv')
    expect(names).toContain('idx_usage_conv')
  })

  it('supports :memory: for testing', () => {
    const memDb = createDatabase(':memory:')
    const tables = memDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[]
    expect(tables.length).toBeGreaterThan(0)
    memDb.close()
  })
})
