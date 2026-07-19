import { EmailChannel } from './email'
import { HttpChannel } from './http'
import type { ForwardChannel } from './types'

/**
 * 渠道注册表：按 type 取 ForwardChannel 实例。
 * v1 注册 email + http；新增渠道只需在此登记，引擎无需改动。
 * 参考设计文档 §5.2
 */
const registry = new Map<string, ForwardChannel>()

export function registerChannel(channel: ForwardChannel): void {
  registry.set(channel.type, channel)
}

export function getChannel(type: string): ForwardChannel | undefined {
  return registry.get(type)
}

export function registeredTypes(): string[] {
  return [...registry.keys()]
}

// v1 默认注册（Phone/WS 已预留但不注册，避免误用）
registerChannel(new EmailChannel())
registerChannel(new HttpChannel())
