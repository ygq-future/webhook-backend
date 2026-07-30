import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Inbox, ArrowUpRight, Clock, RefreshCw } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageBody, PageHeader, PageLayout } from '@/components/page-layout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { statsApi, type InboundWithOutbound, type LogRow } from '@/lib/api'

/** 把任意值尽量漂亮地展示为文本 */
function display(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return ''
    try {
      return JSON.stringify(JSON.parse(t), null, 2)
    } catch {
      return v
    }
  }
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

function StatusBadge({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span
      className={
        ok
          ? 'rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-medium text-white'
          : 'rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-300'
      }>
      {label ?? (ok ? '成功' : '失败')}
    </span>
  )
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className="text-foreground/90 rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs font-semibold">
      {method}
    </span>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-muted-foreground text-xs font-medium">{title}</div>
      {children}
    </div>
  )
}

function Code({ value }: { value: string }) {
  if (!value) return <div className="text-muted-foreground text-xs">（空）</div>
  return (
    <pre className="glass-soft text-foreground/90 max-h-48 overflow-auto rounded-xl border border-white/10 p-3 font-mono text-xs leading-relaxed">
      {value}
    </pre>
  )
}

function OutboundCard({ log }: { log: LogRow }) {
  const ok = log.status === 'success'
  return (
    <div className="glass-soft space-y-3 rounded-2xl border border-white/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge ok={ok} />
        <span className="text-foreground text-sm font-medium">{log.channel}</span>
        <span className="text-muted-foreground text-sm">· {log.target}</span>
        {log.durationMs != null && (
          <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
            <Clock className="h-3 w-3" />
            {log.durationMs} ms
          </span>
        )}
      </div>

      <Block title="出站请求">
        <div className="flex items-center gap-2 text-sm">
          <ArrowUpRight className="text-primary h-4 w-4 shrink-0" />
          <MethodBadge method={log.requestMethod ?? '—'} />
          <span className="font-mono text-xs break-all">{log.requestUrl}</span>
        </div>
        {log.requestHeaders && Object.keys(log.requestHeaders).length > 0 && (
          <Code value={display(log.requestHeaders)} />
        )}
        {log.requestBody && <Code value={display(log.requestBody)} />}
      </Block>

      <Block title="出站响应">
        <div className="text-sm">
          {log.responseStatus != null ? (
            <span className={ok ? 'text-white' : 'text-red-300'}>状态码 {log.responseStatus}</span>
          ) : (
            <span className="text-red-300">无响应（网络/超时错误）</span>
          )}
          {log.error && <span className="text-muted-foreground"> · {log.error}</span>}
        </div>
        {log.responseBody && <Code value={display(log.responseBody)} />}
      </Block>
    </div>
  )
}

function InboundCard({ item, open, onToggle }: { item: InboundWithOutbound; open: boolean; onToggle: () => void }) {
  const { inbound, outbound } = item
  const failedCount = outbound.filter(o => o.status === 'failed').length
  const bodyPreview = (inbound.body ?? '').slice(0, 160)
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5">
        <div className="mt-0.5">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="text-muted-foreground h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <MethodBadge method={inbound.method} />
            <span className="font-mono text-sm font-medium">/wh/{inbound.subpath}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
              {inbound.mode === 'reply' ? 'reply · 直接响应' : 'forward · 转发'}
            </span>
            <span className="text-muted-foreground text-xs">{new Date(inbound.createdAt).toLocaleString()}</span>
            {outbound.length > 0 && (
              <span className="text-muted-foreground text-xs">
                · {outbound.length} 个出站
                {failedCount > 0 && <span className="text-red-300">（{failedCount} 失败）</span>}
              </span>
            )}
          </div>
          {bodyPreview && <div className="text-muted-foreground mt-1 truncate font-mono text-xs">{bodyPreview}</div>}
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-white/10 p-4">
          <Block title="入站请求">
            <div className="flex items-center gap-2 text-sm">
              <Inbox className="text-primary h-4 w-4" />
              <MethodBadge method={inbound.method} />
              <span className="font-mono text-xs">/wh/{inbound.subpath}</span>
            </div>
            {inbound.headers && Object.keys(inbound.headers).length > 0 && <Code value={display(inbound.headers)} />}
            <Code value={display(inbound.body)} />
          </Block>

          <Block title={inbound.mode === 'reply' ? '处理结果' : `出站转发（${outbound.length}）`}>
            {outbound.length === 0 ? (
              <div className="text-muted-foreground text-xs">
                {inbound.mode === 'reply' ? 'reply 模式：已直接返回自定义响应，未产生出站记录' : '（无出站记录）'}
              </div>
            ) : (
              <div className="space-y-3">
                {outbound.map(o => (
                  <OutboundCard key={o.id} log={o} />
                ))}
              </div>
            )}
          </Block>
        </div>
      )}
    </Card>
  )
}

export default function Logs() {
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set())
  const [onlyFailed, setOnlyFailed] = React.useState(false)
  const [mode, setMode] = React.useState<'reply' | 'forward'>('forward')
  const [page, setPage] = React.useState(1)
  const pageSize = 20

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['logs-inbound', mode, onlyFailed, page],
    queryFn: () => statsApi.inbound({ mode, status: onlyFailed ? 'failed' : undefined, page, pageSize }),
  })

  const list = data?.items ?? []

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function changeMode(next: 'reply' | 'forward') {
    setMode(next)
    setPage(1)
    setExpanded(new Set())
  }

  return (
    <PageLayout>
      <PageHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">入站日志</h1>
          <p className="text-muted-foreground text-sm">查看已通过校验的入站请求；forward 会附带出站明细</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={mode} onValueChange={v => changeMode(v as 'reply' | 'forward')}>
            <SelectTrigger className="w-[166px]" aria-label="日志类型">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reply">reply · 直接响应</SelectItem>
              <SelectItem value="forward">forward · 转发</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="刷新日志"
            aria-label="刷新日志">
            <RefreshCw className={isFetching ? 'animate-spin' : ''} />
            刷新
          </Button>
          <Button variant={onlyFailed ? 'default' : 'outline'} size="sm" onClick={() => setOnlyFailed(v => !v)}>
            {onlyFailed ? '显示全部' : '仅看失败'}
          </Button>
        </div>
      </PageHeader>

      <PageBody className="space-y-6 pr-1">
        {isLoading ? (
          <div className="text-muted-foreground py-12 text-center text-sm">加载中…</div>
        ) : list.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center text-sm">
            {onlyFailed ? '没有失败的入站记录' : '暂无入站日志，先发一条 Webhook 试试'}
          </div>
        ) : (
          <div className="space-y-3">
            {list.map(i => (
              <InboundCard
                key={i.inbound.id}
                item={i}
                open={expanded.has(i.inbound.id)}
                onToggle={() => toggle(i.inbound.id)}
              />
            ))}
          </div>
        )}

        {data && data.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-white/10 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">
              第 {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} 页 · 共 {data.total} 条
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage(p => Math.max(1, p - 1))}>
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.hasNext || isFetching}
                onClick={() => setPage(p => p + 1)}>
                下一页
              </Button>
            </div>
          </div>
        )}
      </PageBody>
    </PageLayout>
  )
}
