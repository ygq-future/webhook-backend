import { expect, test } from 'bun:test'
import { emailTargetSchema, httpTargetSchema, endpointSchema, forwardTargetSchema } from './index'

test('emailTargetSchema: 合法邮件目标使用默认值', () => {
  const ok = emailTargetSchema.parse({ channel: 'email', accountId: 'a1', to: 'a@b.com' })
  expect(ok.subjectTpl).toBe('Webhook 通知')
  expect(ok.format).toBe('text')
})

test('httpTargetSchema: 合法出站 HTTP 目标（含 dot-path 抽取）', () => {
  const ok = httpTargetSchema.parse({
    channel: 'http',
    url: 'https://example.com/hook',
    method: 'POST',
    bodyExpr: 'data.message',
  })
  expect(ok.timeoutMs).toBe(10000)
  expect(ok.retries).toBe(3)
})

test('endpointSchema: 非法子路径应校验失败', () => {
  expect(() =>
    endpointSchema.parse({
      subpath: 'Bad Path!',
      title: 't',
      targets: [{ channel: 'email', accountId: 'a1', to: 'a@b.com' }],
    }),
  ).toThrow()
})

test('forwardTargetSchema: 按 channel 区分联合类型', () => {
  const email = forwardTargetSchema.parse({ channel: 'email', accountId: 'a1', to: 'a@b.com' })
  expect(email.channel).toBe('email')
  const http = forwardTargetSchema.parse({ channel: 'http', url: 'https://x.com' })
  expect(http.channel).toBe('http')
})

test('endpointSchema: reply 模式允许无转发目标并要求响应配置', () => {
  const endpoint = endpointSchema.parse({
    subpath: 'heartbeat',
    title: '心跳检查',
    mode: 'reply',
    reply: { status: 200, contentType: 'json', body: '{"ok":true}' },
  })
  expect(endpoint.targets).toEqual([])
  expect(endpoint.reply?.status).toBe(200)
})
