import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { accountsApi, type AccountRow } from '@/lib/api'

interface FormState {
  name: string
  provider: 'gmail' | 'qq' | '163'
  email: string
  authCode: string
  fromName: string
  proxy: string
}

const EMPTY: FormState = { name: '', provider: 'qq', email: '', authCode: '', fromName: '', proxy: '' }

const PROVIDER_LABEL: Record<string, string> = { gmail: 'Gmail', qq: 'QQ 邮箱', '163': '163 邮箱' }

function AccountDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: AccountRow | null
}) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState<FormState>(EMPTY)

  React.useEffect(() => {
    if (open) {
      setForm(
        editing
          ? {
              name: editing.name,
              provider: editing.provider,
              email: editing.email,
              authCode: '',
              fromName: editing.fromName ?? '',
              proxy: editing.proxy ?? '',
            }
          : EMPTY,
      )
    }
  }, [open, editing])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        provider: form.provider,
        email: form.email,
        fromName: form.fromName || undefined,
      }
      if (editing) payload.proxy = form.proxy.trim() || null
      else if (form.proxy.trim()) payload.proxy = form.proxy.trim()
      if (form.authCode.trim()) payload.authCode = form.authCode.trim()
      if (editing) return accountsApi.update(editing.id, payload)
      return accountsApi.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      toast.success(editing ? '账号已更新' : '账号已创建')
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error('保存失败', { description: e.message }),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.email) return toast.error('请填写名称与邮箱')
    if (!editing && !form.authCode.trim()) return toast.error('请填写授权码')
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? '编辑邮箱账号' : '新增邮箱账号'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>名称</Label>
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="如：通知邮箱"
            />
          </div>
          <div className="space-y-2">
            <Label>SMTP 代理（可选）</Label>
            <Input
              value={form.proxy}
              onChange={e => setForm({ ...form, proxy: e.target.value })}
              placeholder="http://host.docker.internal:7890"
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              仅用于 SMTP 连接，支持 HTTP/HTTPS CONNECT。Docker 中访问宿主机代理通常使用
              <code className="rounded bg-white/10 px-1">host.docker.internal</code>，不能直接照搬宿主机的
              <code className="rounded bg-white/10 px-1">127.0.0.1</code>。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>服务商</Label>
              <Select
                value={form.provider}
                onValueChange={v => setForm({ ...form, provider: v as FormState['provider'] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gmail">Gmail</SelectItem>
                  <SelectItem value="qq">QQ 邮箱</SelectItem>
                  <SelectItem value="163">163 邮箱</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>发件人昵称（可选）</Label>
              <Input value={form.fromName} onChange={e => setForm({ ...form, fromName: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>邮箱地址</Label>
            <Input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>
              授权码 / 应用专用密码{editing && <span className="text-muted-foreground">（留空则不修改）</span>}
            </Label>
            <Input
              type="password"
              value={form.authCode}
              onChange={e => setForm({ ...form, authCode: e.target.value })}
              placeholder={editing ? '••••••（已配置）' : 'SMTP 授权码'}
            />
            <p className="text-muted-foreground text-xs">
              SMTP 主机/端口按服务商预设自动填充（Gmail/QQ/163 均为 465 SSL）。
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function Accounts() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['accounts'], queryFn: accountsApi.list })
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AccountRow | null>(null)

  const removeMutation = useMutation({
    mutationFn: (id: number) => accountsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      toast.success('账号已删除')
    },
    onError: (e: Error) => toast.error('删除失败', { description: e.message }),
  })

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }
  function openEdit(a: AccountRow) {
    setEditing(a)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">邮箱账号</h1>
          <p className="text-muted-foreground text-sm">用于 Email 转发通道的发件账号</p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          新增账号
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead className="hidden sm:table-cell">服务商</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead className="hidden md:table-cell">SMTP</TableHead>
                <TableHead>授权码</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-center">
                    加载中…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-center">
                    暂无账号，点击右上角新增
                  </TableCell>
                </TableRow>
              )}
              {data?.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">{PROVIDER_LABEL[a.provider] ?? a.provider}</TableCell>
                  <TableCell>{a.email}</TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">
                    {a.host}:{a.port}
                    {a.secure ? ' (SSL)' : ''}
                    {a.proxy ? <div className="text-xs text-white/50">代理已配置</div> : null}
                  </TableCell>
                  <TableCell>
                    {a.hasSecret ? <Badge variant="success">已配置</Badge> : <Badge variant="secondary">未配置</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`确认删除账号「${a.name}」？`)) removeMutation.mutate(a.id)
                        }}>
                        <Trash2 className="text-destructive h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AccountDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  )
}
