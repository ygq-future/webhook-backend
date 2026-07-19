import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { accountsApi, endpointsApi, type EndpointRow, type ForwardTarget } from '@/lib/api'

/* ---------------- 表单内部类型（宽松，提交前归一） ---------------- */
interface EmailTargetForm {
  channel: 'email'
  accountId: string
  to: string
  subjectTpl: string
  bodyTpl: string
  format: 'text' | 'html'
}
interface HttpTargetForm {
  channel: 'http'
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  bodyExpr: string
  bodyTpl: string
  contentType: 'json' | 'form' | 'text'
  authType: 'none' | 'bearer' | 'basic' | 'hmac'
  authToken: string
  authUser: string
  authPass: string
  authHeader: string
  authScheme: 'hex' | 'base64' | 'prefix' | 'scheme'
  authSecret: string
  timeoutMs: number
  retries: number
}
type TargetForm = EmailTargetForm | HttpTargetForm

interface FormState {
  subpath: string
  title: string
  description: string
  active: boolean
  anyMethod: boolean
  methods: string
  parserSource: 'body' | 'query' | 'header'
  parserContentType: 'json' | 'form' | 'text' | 'raw'
  mapping: { key: string; value: string }[]
  authType: 'none' | 'hmac'
  hmacHeader: string
  hmacScheme: 'hex' | 'base64' | 'prefix' | 'scheme'
  hmacSignData: 'raw-body' | 'raw-body+ts' | 'query' | 'header'
  hmacAlgorithm: 'sha256' | 'sha1' | 'sha512'
  hmacSecret: string
  targets: TargetForm[]
}

const emptyEmailTarget = (): EmailTargetForm => ({
  channel: 'email',
  accountId: '',
  to: '',
  subjectTpl: 'Webhook 通知',
  bodyTpl: '{{event}}',
  format: 'text',
})
const emptyHttpTarget = (): HttpTargetForm => ({
  channel: 'http',
  url: '',
  method: 'POST',
  bodyExpr: '',
  bodyTpl: '',
  contentType: 'json',
  authType: 'none',
  authToken: '',
  authUser: '',
  authPass: '',
  authHeader: 'X-Signature',
  authScheme: 'hex',
  authSecret: '',
  timeoutMs: 10000,
  retries: 3,
})

const EMPTY: FormState = {
  subpath: '',
  title: '',
  description: '',
  active: true,
  anyMethod: false,
  methods: 'POST',
  parserSource: 'body',
  parserContentType: 'json',
  mapping: [],
  authType: 'none',
  hmacHeader: 'X-Signature',
  hmacScheme: 'hex',
  hmacSignData: 'raw-body',
  hmacAlgorithm: 'sha256',
  hmacSecret: '',
  targets: [emptyEmailTarget()],
}

/* ---------------- 现有端点 → 表单 ---------------- */
function toForm(ep: EndpointRow): FormState {
  const auth = ep.auth as Record<string, unknown>
  const isHmac = auth?.type === 'hmac'
  return {
    subpath: ep.subpath,
    title: ep.title,
    description: ep.description ?? '',
    active: ep.active,
    anyMethod: ep.methods.includes('*'),
    methods: ep.methods.filter(m => m !== '*').join(',') || 'POST',
    parserSource: (ep.parser?.source ?? 'body') as FormState['parserSource'],
    parserContentType: (ep.parser?.contentType ?? 'json') as FormState['parserContentType'],
    mapping: ep.parser?.mapping ? Object.entries(ep.parser.mapping).map(([key, value]) => ({ key, value })) : [],
    authType: isHmac ? 'hmac' : 'none',
    hmacHeader: (auth?.header as string) ?? 'X-Signature',
    hmacScheme: (auth?.scheme as FormState['hmacScheme']) ?? 'hex',
    hmacSignData: (auth?.signData as FormState['hmacSignData']) ?? 'raw-body',
    hmacAlgorithm: (auth?.algorithm as FormState['hmacAlgorithm']) ?? 'sha256',
    hmacSecret: '',
    targets: ep.targets.map(t =>
      t.channel === 'email'
        ? {
            channel: 'email',
            accountId: t.accountId,
            to: t.to,
            subjectTpl: t.subjectTpl ?? 'Webhook 通知',
            bodyTpl: t.bodyTpl ?? '{{event}}',
            format: t.format ?? 'text',
          }
        : {
            channel: 'http',
            url: t.url,
            method: t.method ?? 'POST',
            bodyExpr: t.bodyExpr ?? '',
            bodyTpl: t.bodyTpl ?? '',
            contentType: t.contentType ?? 'json',
            authType: t.auth?.type ?? 'none',
            authToken: t.auth?.type === 'bearer' ? t.auth.token : '',
            authUser: t.auth?.type === 'basic' ? t.auth.username : '',
            authPass: t.auth?.type === 'basic' ? t.auth.password : '',
            authHeader: t.auth?.type === 'hmac' ? t.auth.header : 'X-Signature',
            authScheme: t.auth?.type === 'hmac' ? t.auth.scheme : 'hex',
            authSecret: '',
            timeoutMs: t.timeoutMs ?? 10000,
            retries: t.retries ?? 3,
          },
    ),
  }
}

/* ---------------- 表单 → 提交 payload ---------------- */
function buildPayload(form: FormState, editing: boolean): Record<string, unknown> {
  const methods = form.anyMethod
    ? ['*']
    : form.methods
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)

  const mapping: Record<string, string> = {}
  for (const { key, value } of form.mapping) if (key.trim()) mapping[key.trim()] = value.trim()

  const parser =
    Object.keys(mapping).length > 0 || form.parserSource !== 'body' || form.parserContentType !== 'json'
      ? {
          source: form.parserSource,
          contentType: form.parserContentType,
          mapping: Object.keys(mapping).length ? mapping : undefined,
        }
      : undefined

  let auth: Record<string, unknown>
  if (form.authType === 'hmac') {
    auth = {
      type: 'hmac',
      header: form.hmacHeader,
      scheme: form.hmacScheme,
      signData: form.hmacSignData,
      algorithm: form.hmacAlgorithm,
    }
    // 密钥：新建必填；编辑留空表示沿用
    if (form.hmacSecret.trim() || !editing) auth.secretRef = form.hmacSecret.trim()
  } else {
    auth = { type: 'none' }
  }

  const targets: ForwardTarget[] = form.targets.map(t => {
    if (t.channel === 'email') {
      return {
        channel: 'email',
        accountId: t.accountId,
        to: t.to,
        subjectTpl: t.subjectTpl,
        bodyTpl: t.bodyTpl,
        format: t.format,
      }
    }
    let outAuth: Record<string, unknown> = { type: 'none' }
    if (t.authType === 'bearer') outAuth = { type: 'bearer', token: t.authToken }
    else if (t.authType === 'basic') outAuth = { type: 'basic', username: t.authUser, password: t.authPass }
    else if (t.authType === 'hmac')
      outAuth = { type: 'hmac', header: t.authHeader, scheme: t.authScheme, secretRef: t.authSecret }
    return {
      channel: 'http',
      url: t.url,
      method: t.method,
      bodyExpr: t.bodyExpr || undefined,
      bodyTpl: t.bodyTpl || undefined,
      contentType: t.contentType,
      auth: outAuth,
      timeoutMs: t.timeoutMs,
      retries: t.retries,
    } as ForwardTarget
  })

  return {
    subpath: form.subpath,
    title: form.title,
    description: form.description || undefined,
    active: form.active,
    methods,
    parser,
    auth,
    targets,
  }
}

export function EndpointDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: EndpointRow | null
}) {
  const qc = useQueryClient()
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: accountsApi.list })
  const [form, setForm] = React.useState<FormState>(EMPTY)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  React.useEffect(() => {
    if (open) setForm(editing ? toForm(editing) : EMPTY)
  }, [open, editing])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(form, Boolean(editing))
      if (editing) return endpointsApi.update(editing.id, payload)
      return endpointsApi.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['endpoints'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      toast.success(editing ? '子路径已更新' : '子路径已创建')
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error('保存失败', { description: e.message }),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.subpath || !form.title) return toast.error('请填写子路径与标题')
    if (form.targets.length === 0) return toast.error('至少配置一个转发目标')
    if (form.authType === 'hmac' && !editing && !form.hmacSecret.trim()) return toast.error('HMAC 校验需填写密钥')
    mutation.mutate()
  }

  /* ---- targets 操作 ---- */
  const updateTarget = (i: number, patch: Partial<TargetForm>) =>
    setForm(f => ({ ...f, targets: f.targets.map((t, idx) => (idx === i ? ({ ...t, ...patch } as TargetForm) : t)) }))
  const addTarget = () => setForm(f => ({ ...f, targets: [...f.targets, emptyEmailTarget()] }))
  const removeTarget = (i: number) => setForm(f => ({ ...f, targets: f.targets.filter((_, idx) => idx !== i) }))
  const switchChannel = (i: number, channel: 'email' | 'http') =>
    setForm(f => ({
      ...f,
      targets: f.targets.map((t, idx) =>
        idx === i ? (channel === 'email' ? emptyEmailTarget() : emptyHttpTarget()) : t,
      ),
    }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑子路径' : '新建子路径'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          {/* 基本信息 */}
          <section className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  子路径 <span className="text-muted-foreground">/wh/…</span>
                </Label>
                <Input
                  value={form.subpath}
                  onChange={e => set('subpath', e.target.value)}
                  placeholder="sms"
                  disabled={Boolean(editing)}
                />
              </div>
              <div className="space-y-2">
                <Label>标题</Label>
                <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="短信转发" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>描述（可选）</Label>
              <Input value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.active} onCheckedChange={v => set('active', v)} />
                启用
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.anyMethod} onCheckedChange={v => set('anyMethod', v)} />
                接受任意方法
              </label>
            </div>
            {!form.anyMethod && (
              <div className="space-y-2">
                <Label>允许的方法（逗号分隔）</Label>
                <Input value={form.methods} onChange={e => set('methods', e.target.value)} placeholder="POST,GET" />
              </div>
            )}
          </section>

          {/* 解析 */}
          <section className="glass-soft space-y-3 rounded-2xl p-4">
            <div className="text-sm font-medium">入站解析</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>取值来源</Label>
                <Select
                  value={form.parserSource}
                  onValueChange={v => set('parserSource', v as FormState['parserSource'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="body">请求体 body</SelectItem>
                    <SelectItem value="query">查询参数 query</SelectItem>
                    <SelectItem value="header">请求头 header</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>内容类型</Label>
                <Select
                  value={form.parserContentType}
                  onValueChange={v => set('parserContentType', v as FormState['parserContentType'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="form">Form</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="raw">Raw</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>字段映射（变量名 ← dot-path）</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => set('mapping', [...form.mapping, { key: '', value: '' }])}>
                  <Plus className="h-3.5 w-3.5" />
                  添加
                </Button>
              </div>
              {form.mapping.map((m, i) => (
                <div key={i} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
                  <Input
                    value={m.key}
                    placeholder="text"
                    onChange={e =>
                      set(
                        'mapping',
                        form.mapping.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x)),
                      )
                    }
                  />
                  <span className="text-muted-foreground">←</span>
                  <Input
                    value={m.value}
                    placeholder="data.message"
                    onChange={e =>
                      set(
                        'mapping',
                        form.mapping.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      set(
                        'mapping',
                        form.mapping.filter((_, idx) => idx !== i),
                      )
                    }>
                    <Trash2 className="text-destructive h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {/* HMAC 校验 */}
          <section className="glass-soft space-y-3 rounded-2xl p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={form.authType === 'hmac'} onCheckedChange={v => set('authType', v ? 'hmac' : 'none')} />
              启用 HMAC-SHA-256 验签
            </label>
            {form.authType === 'hmac' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>签名请求头</Label>
                    <Input value={form.hmacHeader} onChange={e => set('hmacHeader', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>编码方案</Label>
                    <Select
                      value={form.hmacScheme}
                      onValueChange={v => set('hmacScheme', v as FormState['hmacScheme'])}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hex">hex</SelectItem>
                        <SelectItem value="base64">base64</SelectItem>
                        <SelectItem value="prefix">prefix（如 sha256=）</SelectItem>
                        <SelectItem value="scheme">scheme（如 HMAC xxx）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>被签名数据</Label>
                    <Select
                      value={form.hmacSignData}
                      onValueChange={v => set('hmacSignData', v as FormState['hmacSignData'])}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="raw-body">raw-body</SelectItem>
                        <SelectItem value="raw-body+ts">raw-body+ts（防重放）</SelectItem>
                        <SelectItem value="query">query</SelectItem>
                        <SelectItem value="header">header</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>算法</Label>
                    <Select
                      value={form.hmacAlgorithm}
                      onValueChange={v => set('hmacAlgorithm', v as FormState['hmacAlgorithm'])}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sha256">sha256</SelectItem>
                        <SelectItem value="sha1">sha1</SelectItem>
                        <SelectItem value="sha512">sha512</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>密钥{editing && <span className="text-muted-foreground">（留空则不修改）</span>}</Label>
                  <Input
                    type="password"
                    value={form.hmacSecret}
                    onChange={e => set('hmacSecret', e.target.value)}
                    placeholder={editing ? '••••••（已配置）' : '共享密钥'}
                  />
                </div>
              </div>
            )}
          </section>

          {/* 转发目标 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">转发目标</div>
              <Button type="button" variant="outline" size="sm" onClick={addTarget}>
                <Plus className="h-3.5 w-3.5" />
                添加目标
              </Button>
            </div>
            {form.targets.map((t, i) => (
              <div key={i} className="glass-soft space-y-3 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <Select value={t.channel} onValueChange={v => switchChannel(i, v as 'email' | 'http')}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">邮件</SelectItem>
                      <SelectItem value="http">HTTP</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex-1" />
                  {form.targets.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeTarget(i)}>
                      <Trash2 className="text-destructive h-4 w-4" />
                    </Button>
                  )}
                </div>

                {t.channel === 'email' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>发件账号</Label>
                        <Select value={t.accountId} onValueChange={v => updateTarget(i, { accountId: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="选择账号" />
                          </SelectTrigger>
                          <SelectContent>
                            {(accounts ?? []).map(a => (
                              <SelectItem key={a.id} value={String(a.id)}>
                                {a.name}（{a.email}）
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>收件人</Label>
                        <Input
                          value={t.to}
                          onChange={e => updateTarget(i, { to: e.target.value })}
                          placeholder="a@b.com,c@d.com"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>邮件主题模板</Label>
                      <Input value={t.subjectTpl} onChange={e => updateTarget(i, { subjectTpl: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>邮件正文模板（支持 {'{{变量}}'}）</Label>
                      <Textarea value={t.bodyTpl} onChange={e => updateTarget(i, { bodyTpl: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>格式</Label>
                      <Select value={t.format} onValueChange={v => updateTarget(i, { format: v as 'text' | 'html' })}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">纯文本</SelectItem>
                          <SelectItem value="html">HTML</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                      <div className="space-y-2">
                        <Label>目标 URL</Label>
                        <Input
                          value={t.url}
                          onChange={e => updateTarget(i, { url: e.target.value })}
                          placeholder="https://…"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>方法</Label>
                        <Select
                          value={t.method}
                          onValueChange={v => updateTarget(i, { method: v as HttpTargetForm['method'] })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map(m => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>抽取表达式 bodyExpr（可选）</Label>
                        <Input
                          value={t.bodyExpr}
                          onChange={e => updateTarget(i, { bodyExpr: e.target.value })}
                          placeholder="data.message"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>内容类型</Label>
                        <Select
                          value={t.contentType}
                          onValueChange={v => updateTarget(i, { contentType: v as HttpTargetForm['contentType'] })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="json">JSON</SelectItem>
                            <SelectItem value="form">Form</SelectItem>
                            <SelectItem value="text">Text</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Body 模板（可选，支持 {'{{变量}}'}）</Label>
                      <Textarea
                        value={t.bodyTpl}
                        onChange={e => updateTarget(i, { bodyTpl: e.target.value })}
                        placeholder='{"text":"{{text}}"}'
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>超时（ms）</Label>
                        <Input
                          type="number"
                          value={t.timeoutMs}
                          onChange={e => updateTarget(i, { timeoutMs: Number(e.target.value) || 10000 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>重试次数</Label>
                        <Input
                          type="number"
                          value={t.retries}
                          onChange={e => updateTarget(i, { retries: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>出站鉴权</Label>
                      <Select
                        value={t.authType}
                        onValueChange={v => updateTarget(i, { authType: v as HttpTargetForm['authType'] })}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">无</SelectItem>
                          <SelectItem value="bearer">Bearer Token</SelectItem>
                          <SelectItem value="basic">Basic Auth</SelectItem>
                          <SelectItem value="hmac">HMAC 反向签名</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {t.authType === 'bearer' && (
                      <Input
                        value={t.authToken}
                        onChange={e => updateTarget(i, { authToken: e.target.value })}
                        placeholder="Token"
                      />
                    )}
                    {t.authType === 'basic' && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                          value={t.authUser}
                          onChange={e => updateTarget(i, { authUser: e.target.value })}
                          placeholder="用户名"
                        />
                        <Input
                          type="password"
                          value={t.authPass}
                          onChange={e => updateTarget(i, { authPass: e.target.value })}
                          placeholder="密码"
                        />
                      </div>
                    )}
                    {t.authType === 'hmac' && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Input
                          value={t.authHeader}
                          onChange={e => updateTarget(i, { authHeader: e.target.value })}
                          placeholder="X-Signature"
                        />
                        <Select
                          value={t.authScheme}
                          onValueChange={v => updateTarget(i, { authScheme: v as HttpTargetForm['authScheme'] })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hex">hex</SelectItem>
                            <SelectItem value="base64">base64</SelectItem>
                            <SelectItem value="prefix">prefix</SelectItem>
                            <SelectItem value="scheme">scheme</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="password"
                          value={t.authSecret}
                          onChange={e => updateTarget(i, { authSecret: e.target.value })}
                          placeholder="密钥"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>

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
