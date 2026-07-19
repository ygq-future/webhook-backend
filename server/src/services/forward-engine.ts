import type { ForwardTarget } from '@wh/shared'
import type { EndpointRow, Repos } from '../db/types'
import { getChannel } from './channels/registry'
import type { ChannelDeps } from './channels/types'
import { decryptSecret } from './crypto'
import { buildEvent, type RawRequestInput } from './event'

/**
 * 转发引擎：把一次入站请求编排分发到端点配置的所有转发目标。
 * - 归一为事件对象（buildEvent）
 * - 遍历 targets，按渠道类型从注册表取 ForwardChannel 并投递
 * - 逐条记录成功/失败日志（不因单个目标失败而中断其它目标）
 * 参考设计文档 §5.2 / §6 数据流
 */

export interface ForwardOutcome {
  channel: string
  target: string
  ok: boolean
  detail?: string
}

/** 为日志/响应生成目标可读标识（不含敏感信息） */
function targetLabel(target: ForwardTarget): string {
  switch (target.channel) {
    case 'email':
      return target.to
    case 'http':
      return `${target.method} ${target.url}`
    default:
      return (target as { channel: string }).channel
  }
}

/**
 * 执行一次端点的完整转发。返回每个目标的结果（同时已落库日志）。
 * 注：整体不抛错——任何单目标异常都会被捕获并记为 failed。
 */
export async function forwardEvent(
  endpoint: EndpointRow,
  input: RawRequestInput,
  repos: Repos,
): Promise<ForwardOutcome[]> {
  const event = buildEvent(input, endpoint.parser ?? undefined)

  const deps: ChannelDeps = {
    getAccount: id => repos.accounts.get(id),
    decrypt: decryptSecret,
  }

  const outcomes: ForwardOutcome[] = []

  for (const target of endpoint.targets) {
    const channel = getChannel(target.channel)
    let ok = false
    let detail: string | undefined

    if (!channel) {
      detail = `channel "${target.channel}" not registered`
    } else {
      try {
        const result = await channel.deliver(target, event, deps)
        ok = result.ok
        detail = result.detail
      } catch (e) {
        detail = e instanceof Error ? e.message : String(e)
      }
    }

    const label = targetLabel(target)
    await repos.logs.add({
      endpointId: endpoint.id,
      channel: target.channel,
      target: label,
      status: ok ? 'success' : 'failed',
      error: ok ? null : (detail ?? 'unknown error'),
    })

    outcomes.push({ channel: target.channel, target: label, ok, detail })
  }

  return outcomes
}
