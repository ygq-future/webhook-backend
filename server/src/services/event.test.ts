import { describe, expect, test } from 'bun:test'
import { buildEvent, eventContext, parseBody } from './event'

describe('parseBody', () => {
  test('json 解析对象', () => {
    expect(parseBody('{"a":1}', 'json')).toEqual({ a: 1 })
  })

  test('json 解析失败退化为原字符串', () => {
    expect(parseBody('not-json', 'json')).toBe('not-json')
  })

  test('form 解析键值对', () => {
    expect(parseBody('a=1&b=hello%20world', 'form')).toEqual({ a: '1', b: 'hello world' })
  })

  test('text/raw 保持字符串', () => {
    expect(parseBody('plain text', 'text')).toBe('plain text')
    expect(parseBody('raw bytes', 'raw')).toBe('raw bytes')
  })
})

describe('eventContext', () => {
  const baseInput = { method: 'POST', raw: '', headers: {}, query: {} }

  test('未配置 mapping 时请求体顶层字段可直接作为变量', () => {
    const event = buildEvent(
      { ...baseInput, raw: JSON.stringify({ platform: 'qq', message: 'adbc', content: 'HTTP 测试消息' }) },
      { source: 'body', contentType: 'json', mapping: {} },
    )
    const ctx = eventContext(event)
    expect(ctx.message).toBe('adbc')
    expect(ctx.platform).toBe('qq')
    expect(ctx.content).toBe('HTTP 测试消息')
    expect(ctx.body).toEqual({ platform: 'qq', message: 'adbc', content: 'HTTP 测试消息' })
  })

  test('显式 mapping 优先级高于请求体顶层字段', () => {
    const event = buildEvent(
      { ...baseInput, raw: JSON.stringify({ message: 'from-body' }) },
      { source: 'body', contentType: 'json', mapping: { message: 'other' } },
    )
    const ctx = eventContext(event)
    expect(ctx.message).toBeUndefined()
    expect((ctx.vars as Record<string, unknown>).message).toBeUndefined()
  })

  test('body 为数组时不展开（避免 index 键污染）', () => {
    const event = buildEvent(
      { ...baseInput, raw: JSON.stringify([{ a: 1 }, { a: 2 }]) },
      { source: 'body', contentType: 'json' },
    )
    const ctx = eventContext(event)
    expect('0' in ctx).toBe(false)
    expect(ctx.body).toEqual([{ a: 1 }, { a: 2 }])
  })

  test('body 为字符串时不展开', () => {
    const event = buildEvent(
      { ...baseInput, raw: 'plain text' },
      { source: 'body', contentType: 'text' },
    )
    const ctx = eventContext(event)
    expect(ctx.body).toBe('plain text')
    expect(
      Object.keys(ctx).filter(
        k =>
          k.length > 2 &&
          k !== 'body' &&
          k !== 'raw' &&
          k !== 'method' &&
          k !== 'vars' &&
          k !== 'headers' &&
          k !== 'query',
      ),
    ).toHaveLength(0)
  })
})
