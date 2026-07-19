import type { ForwardTarget } from '@wh/shared'
import type { EventObject } from '../event'
import type { ChannelDeps, ForwardChannel, ForwardResult } from './types'

/**
 * WSChannel（预留，未实现）：WebSocket 实时推送渠道占位。
 * 后续向管理后台长连或对外 ws 终端推送事件时实现 deliver()。
 * 参考设计文档 §5.2（计划中的渠道）
 */
export class WSChannel implements ForwardChannel {
  type = 'ws'

  async deliver(_target: ForwardTarget, _event: EventObject, _deps: ChannelDeps): Promise<ForwardResult> {
    return { ok: false, detail: 'ws channel not implemented yet' }
  }
}
