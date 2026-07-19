import nodemailer from 'nodemailer'
import type { EmailTarget } from '@wh/shared'
import type { EventObject } from '../event'
import { eventContext } from '../event'
import { renderTemplate } from '../expr'
import type { ChannelDeps, ForwardChannel, ForwardResult, OutboundRequest } from './types'

/**
 * EmailChannel（v1 首实现）：经 SMTP + nodemailer 发送邮件。
 * 参考设计文档 §5.3.1
 */

/** 各邮箱服务商的默认 SMTP 参数（账号未显式覆盖时使用） */
export const SMTP_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  gmail: { host: 'smtp.gmail.com', port: 465, secure: true },
  qq: { host: 'smtp.qq.com', port: 465, secure: true },
  '163': { host: 'smtp.163.com', port: 465, secure: true },
}

export class EmailChannel implements ForwardChannel {
  type = 'email'

  async deliver(target: EmailTarget, event: EventObject, deps: ChannelDeps): Promise<ForwardResult> {
    const account = await deps.getAccount(Number(target.accountId))
    if (!account) return { ok: false, detail: `email account ${target.accountId} not found` }

    let authCode: string
    try {
      authCode = deps.decrypt(account.secretEnc)
    } catch {
      return { ok: false, detail: 'failed to decrypt account secret' }
    }

    const ctx = eventContext(event)
    const subject = renderTemplate(target.subjectTpl ?? 'Webhook 通知', ctx)
    const rendered = renderTemplate(target.bodyTpl ?? '{{raw}}', ctx)
    const to = renderTemplate(target.to, ctx)

    const fromName = account.fromName || account.name
    const from = fromName ? `"${fromName}" <${account.email}>` : account.email

    const request: OutboundRequest = {
      url: `smtp://${account.host}:${account.port}`,
      method: 'SMTP',
      // 日志快照展示纯地址；SMTP 实际发送仍使用带显示名的 RFC 5322 from。
      headers: { from: account.email, to, subject },
      body: rendered,
    }

    const transport = nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.secure,
      auth: { user: account.email, pass: authCode },
      ...(account.proxy ? { proxy: account.proxy } : {}),
    })

    try {
      const info = await transport.sendMail({
        from,
        to,
        subject,
        ...(target.format === 'html' ? { html: rendered } : { text: rendered }),
      })
      return { ok: true, detail: info.messageId, request, response: { status: 250, body: info.messageId } }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, detail: msg, request, response: { status: 0, body: msg } }
    } finally {
      transport.close()
    }
  }
}
