import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Copy } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EndpointDialog } from '@/components/endpoint-dialog'
import { endpointsApi, type EndpointRow } from '@/lib/api'

function channelSummary(ep: EndpointRow): string {
  const counts = ep.targets.reduce<Record<string, number>>((acc, t) => {
    acc[t.channel] = (acc[t.channel] ?? 0) + 1
    return acc
  }, {})
  return Object.entries(counts)
    .map(([k, v]) => `${k === 'email' ? '邮件' : 'HTTP'}×${v}`)
    .join(' · ')
}

export default function Endpoints() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['endpoints'], queryFn: endpointsApi.list })
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<EndpointRow | null>(null)

  const toggleMutation = useMutation({
    mutationFn: (id: number) => endpointsApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['endpoints'] }),
    onError: (e: Error) => toast.error('切换失败', { description: e.message }),
  })
  const removeMutation = useMutation({
    mutationFn: (id: number) => endpointsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['endpoints'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      toast.success('子路径已删除')
    },
    onError: (e: Error) => toast.error('删除失败', { description: e.message }),
  })

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }
  function openEdit(ep: EndpointRow) {
    setEditing(ep)
    setDialogOpen(true)
  }
  function copyUrl(subpath: string) {
    const url = `${location.origin}/wh/${subpath}`
    navigator.clipboard?.writeText(url)
    toast.success('已复制接收地址', { description: url })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">子路径</h1>
          <p className="text-muted-foreground text-sm">每个子路径是一个独立的 Webhook 接收端点</p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          新建子路径
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table className="mobile-data-cards">
            <TableHeader>
              <TableRow>
                <TableHead>子路径</TableHead>
                <TableHead>标题</TableHead>
                <TableHead>方法</TableHead>
                <TableHead>校验</TableHead>
                <TableHead>转发目标</TableHead>
                <TableHead>启用</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground text-center">
                    加载中…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground text-center">
                    暂无子路径，点击右上角新建
                  </TableCell>
                </TableRow>
              )}
              {data?.map(ep => {
                const isHmac = (ep.auth as { type?: string })?.type === 'hmac'
                return (
                  <TableRow key={ep.id}>
                    <TableCell data-label="子路径">
                      <button
                        className="hover:text-primary flex items-center gap-1.5 font-mono text-sm"
                        onClick={() => copyUrl(ep.subpath)}
                        title="点击复制接收地址">
                        /wh/{ep.subpath}
                        <Copy className="h-3.5 w-3.5 opacity-50" />
                      </button>
                    </TableCell>
                    <TableCell data-label="标题" className="font-medium">
                      {ep.title}
                    </TableCell>
                    <TableCell data-label="方法">
                      <span className="text-muted-foreground font-mono text-xs">
                        {ep.methods.includes('*') ? 'ANY' : ep.methods.join(',')}
                      </span>
                    </TableCell>
                    <TableCell data-label="校验">
                      {isHmac ? <Badge variant="outline">HMAC</Badge> : <Badge variant="secondary">无</Badge>}
                    </TableCell>
                    <TableCell data-label="转发目标" className="text-muted-foreground">
                      {ep.mode === 'reply' ? '直接响应' : channelSummary(ep)}
                    </TableCell>
                    <TableCell data-label="启用">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={ep.active}
                          onCheckedChange={() => toggleMutation.mutate(ep.id)}
                          aria-label={ep.active ? '禁用子路径' : '启用子路径'}
                        />
                        <span
                          className={ep.active ? 'text-xs font-medium text-cyan-200' : 'text-muted-foreground text-xs'}>
                          {ep.active ? '已启用' : '已停用'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell data-label="操作" className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(ep)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`确认删除子路径「${ep.title}」？`)) removeMutation.mutate(ep.id)
                          }}>
                          <Trash2 className="text-destructive h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EndpointDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  )
}
