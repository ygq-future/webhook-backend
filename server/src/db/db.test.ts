import { describe, expect, test } from 'bun:test'
import { createSqliteRepos } from './sqlite'

/** DAL 冒烟测试（内存 SQLite），验证账号/端点/日志的基本读写与统计 */
describe('sqlite repos', () => {
  test('account create/list/update/remove', async () => {
    const repos = createSqliteRepos(':memory:')
    const created = await repos.accounts.create({
      channel: 'email',
      name: '测试账号',
      provider: 'qq',
      email: 'a@qq.com',
      secretEnc: 'enc',
      fromName: '通知',
      host: 'smtp.qq.com',
      port: 465,
      secure: true,
      proxy: 'http://proxy.example:7890',
    })
    expect(created.id).toBeGreaterThan(0)
    expect(created.secure).toBe(true)
    expect(created.proxy).toBe('http://proxy.example:7890')

    const list = await repos.accounts.list()
    expect(list).toHaveLength(1)

    const updated = await repos.accounts.update(created.id, { name: '改名' })
    expect(updated?.name).toBe('改名')

    expect(await repos.accounts.remove(created.id)).toBe(true)
    expect(await repos.accounts.list()).toHaveLength(0)
    await repos.close()
  })

  test('endpoint json columns roundtrip + stats', async () => {
    const repos = createSqliteRepos(':memory:')
    const ep = await repos.endpoints.create({
      subpath: 'sms-inbox',
      title: '短信',
      description: null,
      active: true,
      methods: ['POST'],
      parser: { source: 'body', contentType: 'json', mapping: { text: 'text' } },
      auth: { type: 'none' },
      targets: [{ channel: 'email', accountId: '1', to: 'me@x.com', subjectTpl: 's', bodyTpl: 'b', format: 'text' }],
    })
    expect(ep.methods).toEqual(['POST'])
    expect(ep.targets[0].channel).toBe('email')

    const found = await repos.endpoints.getBySubpath('sms-inbox')
    expect(found?.id).toBe(ep.id)

    await repos.logs.add({ endpointId: ep.id, channel: 'email', target: 'me@x.com', status: 'success', error: null })
    await repos.logs.add({ endpointId: ep.id, channel: 'email', target: 'me@x.com', status: 'failed', error: 'boom' })
    const stats = await repos.logs.stats()
    expect(stats.endpoints).toBe(1)
    expect(stats.success).toBe(1)
    expect(stats.failed).toBe(1)
    await repos.close()
  })
})
