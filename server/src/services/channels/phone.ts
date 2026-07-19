import type { ForwardTarget } from '@wh/shared'
import type { EventObject } from '../event'
import type { ChannelDeps, ForwardChannel, ForwardResult } from './types'

/**
 * PhoneChannel（预留，未实现）：短信/语音渠道占位。
 * 后续接 Twilio / 阿里云 / 腾讯云短信时实现 deliver()。
 * 参考设计文档 §5.2（计划中的渠道）
 */
export class PhoneChannel implements ForwardChannel {
  type = 'phone'

  async deliver(_target: ForwardTarget, _event: EventObject, _deps: ChannelDeps): Promise<ForwardResult> {
    return { ok: false, detail: 'phone channel not implemented yet' }
  }
}
