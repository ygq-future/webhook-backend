import { createHmac } from 'node:crypto'
import { describe, expect, test } from 'bun:test'
import type { HmacAuth } from '@wh/shared'
import { verifyInboundHmac } from './hmac'

/** 构造签名头（hex/base64/prefix 场景） */
function sign(data: string, secret: string, enc: 'hex' | 'base64' = 'hex'): string {
  return createHmac('sha256', secret).update(data).digest(enc)
}

const baseAuth: HmacAuth = {
  type: 'hmac',
  header: 'x-signature',
  scheme: 'hex',
  signData: 'raw-body',
  algorithm: 'sha256',
  secretRef: 'ignored-here',
}

describe('verifyInboundHmac', () => {
  const secret = 'super-secret'
  const raw = '{"msg":"hi"}'

  test('hex 签名校验通过', () => {
    const sig = sign(raw, secret, 'hex')
    const res = verifyInboundHmac(baseAuth, { raw, headers: { 'x-signature': sig }, query: {} }, secret)
    expect(res.ok).toBe(true)
  })

  test('base64 签名同样兼容', () => {
    const sig = sign(raw, secret, 'base64')
    const res = verifyInboundHmac(baseAuth, { raw, headers: { 'x-signature': sig }, query: {} }, secret)
    expect(res.ok).toBe(true)
  })

  test('prefix 方案（sha256=）', () => {
    const auth: HmacAuth = { ...baseAuth, scheme: 'prefix', prefix: 'sha256=' }
    const sig = `sha256=${sign(raw, secret, 'hex')}`
    const res = verifyInboundHmac(auth, { raw, headers: { 'x-signature': sig }, query: {} }, secret)
    expect(res.ok).toBe(true)
  })

  test('错误签名被拒', () => {
    const res = verifyInboundHmac(baseAuth, { raw, headers: { 'x-signature': 'deadbeef' }, query: {} }, secret)
    expect(res.ok).toBe(false)
  })

  test('缺失签名头被拒', () => {
    const res = verifyInboundHmac(baseAuth, { raw, headers: {}, query: {} }, secret)
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('missing')
  })

  test('时间戳超容差被拒（防重放）', () => {
    const auth: HmacAuth = {
      ...baseAuth,
      signData: 'raw-body+ts',
      timestampHeader: 'x-timestamp',
      tolerance: 300,
    }
    const oldTs = String(Math.floor(Date.now() / 1000) - 10_000)
    const sig = sign(`${oldTs}.${raw}`, secret, 'hex')
    const res = verifyInboundHmac(
      auth,
      { raw, headers: { 'x-signature': sig, 'x-timestamp': oldTs }, query: {} },
      secret,
    )
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('tolerance')
  })
})
