import type { ForwardTarget } from '@wh/shared'
import type { AccountRow } from '../../db/types'
import type { EventObject } from '../event'

/**
 * ForwardChannel 抽象：所有"转发去向"实现统一接口，引擎不感知具体媒介。
 * 参考设计文档 §5.2
 * 说明：设计中的 render + send 两步在各 channel 内部完成，对引擎暴露单一 deliver()，
 * 因为部分渠道（如 email）需要异步解析账号，合并更简洁。
 */

export interface ForwardResult {
  ok: boolean
  detail?: string
}

/** 引擎注入给渠道的依赖（账号解析、密钥解密） */
export interface ChannelDeps {
  getAccount(id: number): Promise<AccountRow | null>
  decrypt(enc: string): string
}

export interface ForwardChannel {
  /** 唯一渠道标识，如 'email' | 'http' */
  type: string
  /** 渲染并投递单个目标（内部完成模板渲染 + 实际发送） */
  deliver(target: ForwardTarget, event: EventObject, deps: ChannelDeps): Promise<ForwardResult>
  /** 可选健康检查 */
  health?(): Promise<boolean>
}
