import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * 加密与安全工具
 * - AES-256-GCM 对称加密（邮箱授权码 / HMAC secret 落库加密）
 * - scrypt 口令哈希（管理员密码）
 * - 恒定时间比较（防时序侧信道）
 * 参考设计文档 §11 安全设计
 */

const FIXED_SALT = 'webhook-forwarder::key-derivation::v1'

/** 由任意口令派生 32 字节密钥（AES-256 需要 32 字节） */
function deriveKey(secret: string): Buffer {
  return scryptSync(secret, FIXED_SALT, 32)
}

function encryptKey(): Buffer {
  const raw = Bun.env.ENCRYPT_KEY ?? 'dev-insecure-encrypt-key-change-me'
  return deriveKey(raw)
}

/**
 * AES-256-GCM 加密，返回 `iv.tag.ciphertext`（均为 base64，点分隔）。
 */
export function encryptSecret(plaintext: string): string {
  const key = encryptKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

/**
 * 解密 `encryptSecret` 的产物；格式非法或校验失败抛错。
 */
export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('invalid ciphertext format')
  const key = encryptKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
  return dec.toString('utf8')
}

/** 用 scrypt 哈希管理员密码，返回 `salt.hash`（base64） */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return [salt.toString('base64'), hash.toString('base64')].join('.')
}

/** 校验密码是否匹配 `hashPassword` 的产物（恒定时间比较） */
export function verifyPassword(password: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split('.')
  if (!saltB64 || !hashB64) return false
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')
  const actual = scryptSync(password, salt, expected.length)
  return timingSafeEqual(expected, actual)
}

/** 恒定时间比较两个字符串（长度不同直接 false） */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** 生成 16 进制随机 token */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('hex')
}
