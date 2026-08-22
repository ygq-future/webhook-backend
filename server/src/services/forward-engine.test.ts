import { afterAll, describe, expect, test } from 'bun:test'
import type { ForwardTarget } from '@wh/shared'
import { createSqliteRepos } from '../db/sqlite'
import type { EndpointRow, Repos } from '../db/types'
import { registerChannel } from './channels/registry'
import type { ChannelDeps } from './channels/types'
import type { EventObject } from './event'
import { forwardEvent } from './forward-engine'

/** 记录被投递事件的 mock 渠道 */
const captured: EventObject[] = []
registerChannel({
  type: 'mock',
  async deliver(_target: ForwardTarget, event: EventObject, _deps: ChannelDeps) {
    captured.push(event)
    return { ok: true, detail: 'mock ok' }
  },
})

registerChannel({
  type: 'mock-fail',
  async deliver() {
    return { ok: false, detail: 'boom' }
  },
})

function makeEndpoint(targets: ForwardTarget[]): EndpointRow {
  return {
    id: 1,
    subpath: 'test',
    title: 'test',
    description: null,
    active: true,
    mode: 'forward',
    methods: ['*'],
    parser: { source: 'body', contentType: 'json', mapping: { text: 'msg' } },
    auth: { type: 'none' },
    targets,
    reply: null,
    createdAt: '',
    updatedAt: '',
  }
}

let repos: Repos
afterAll(async () => {
  await repos?.close()
})

describe('forwardEvent', () => {
  test('解析变量、投递成功并落库日志', async () => {
    repos = await createSqliteRepos(':memory:')
    const target = { channel: 'mock' } as unknown as ForwardTarget
    const endpoint = makeEndpoint([target])

    const outcomes = await forwardEvent(
      endpoint,
      { method: 'POST', raw: JSON.stringify({ msg: 'hi' }), headers: {}, query: {} },
      repos,
    )

    expect(outcomes).toHaveLength(1)
    expect(outcomes[0].ok).toBe(true)
    expect(captured[0].vars.text).toBe('hi')

    const stats = await repos.logs.stats()
    expect(stats.success).toBe(1)
    expect(stats.failed).toBe(0)
  })

  test('单目标失败不影响其它目标，且记录 failed', async () => {
    repos = await createSqliteRepos(':memory:')
    const ok = { channel: 'mock' } as unknown as ForwardTarget
    const bad = { channel: 'mock-fail' } as unknown as ForwardTarget
    const endpoint = makeEndpoint([ok, bad])

    const outcomes = await forwardEvent(endpoint, { method: 'POST', raw: '{}', headers: {}, query: {} }, repos)

    expect(outcomes.map(o => o.ok)).toEqual([true, false])
    const stats = await repos.logs.stats()
    expect(stats.success).toBe(1)
    expect(stats.failed).toBe(1)
  })

  test('未注册渠道记为失败', async () => {
    repos = await createSqliteRepos(':memory:')
    const target = { channel: 'nonexistent' } as unknown as ForwardTarget
    const endpoint = makeEndpoint([target])

    const outcomes = await forwardEvent(endpoint, { method: 'POST', raw: '{}', headers: {}, query: {} }, repos)
    expect(outcomes[0].ok).toBe(false)
    expect(outcomes[0].detail).toContain('not registered')
  })

  test('禁用目标不会投递，也不会写出站日志', async () => {
    repos = await createSqliteRepos(':memory:')
    const target = { channel: 'mock', active: false } as unknown as ForwardTarget
    const endpoint = makeEndpoint([target])

    const outcomes = await forwardEvent(endpoint, { method: 'POST', raw: '{}', headers: {}, query: {} }, repos)

    expect(outcomes).toEqual([])
    expect(await repos.logs.list({ endpointId: endpoint.id })).toEqual([])
  })
})
