import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Code2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { JsonEditor } from '@/components/ui/json-editor'
import { accountsApi, endpointsApi, type ApiError, type EndpointRow, type ForwardTarget } from '@/lib/api'
import { previewHttpBody } from '@/lib/expr'

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
  headers: string
  authType: 'none' | 'bearer' | 'basic' | 'hmac'
  authToken: string
  authUser: string
  authPass: string
  authHeader: string
  authScheme: 'hex' | 'base64' | 'prefix' | 'scheme'
  authSecret: string
  timeoutMs: number
  retries: number
  sampleBody: string
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

const SAMPLE_BODY = '{\n  "message": "hello http forward",\n  "from": "alice",\n  "items": ["a", "b"]\n}'

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
  bodyTpl: '{\n  "text": "{{message}}",\n  "sender": "{{from}}"\n}',
  contentType: 'json',
  headers: '{}',
  authType: 'none',
  authToken: '',
  authUser: '',
  authPass: '',
  authHeader: 'X-Signature',
  authScheme: 'hex',
  authSecret: '',
  timeoutMs: 10000,
  retries: 3,
  sampleBody: SAMPLE_BODY,
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
  // 默认首个目标改为 HTTP，避免空 email 目标触发后端 400
  targets: [emptyHttpTarget()],
}

/* ---------------- 工具函数 ---------------- */
function parseSample(s: string): unknown {
  const t = s.trim()
  if (!t) return {}
  try {
    return JSON.parse(t)
  } catch {
    return t
  }
}

function parseHeaders(str: string): Record<string, string> | undefined {
  const t = str.trim()
  if (!t) return undefined
  try {
    const o = JSON.parse(t)
    if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, string>
  } catch {
    /* 交给校验提示 */
  }
  return undefined
}

/** 客户端校验：在提交前拦截明显错误，给出中文说明 */
function validateTargets(targets: TargetForm[]): string[] {
  const errs: string[] = []
  targets.forEach((t, i) => {
    const label = `转发目标 ${i + 1}（${t.channel === 'email' ? '邮件' : 'HTTP'}）`
    if (t.channel === 'email') {
      if (!t.accountId.trim()) errs.push(`${label}：请选择发件账号`)
      if (!t.to.trim()) errs.push(`${label}：收件人不能为空`)
    } else {
      if (!t.url.trim()) errs.push(`${label}：目标 URL 不能为空`)
      else {
        try {
          new URL(t.url)
        } catch {
          errs.push(`${label}：URL 格式不正确（需 http(s)://…）`)
        }
      }
      if (t.headers.trim()) {
        try {
          const o = JSON.parse(t.headers)
          if (typeof o !== 'object' || o === null || Array.isArray(o)) errs.push(`${label}：Headers 必须是 JSON 对象`)
        } catch {
          errs.push(`${label}：Headers 不是合法 JSON`)
        }
      }
    }
  })
  return errs
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
            headers: t.headers ? JSON.stringify(t.headers, null, 2) : '{}',
            authType: t.auth?.type ?? 'none',
            authToken: t.auth?.type === 'bearer' ? t.auth.token : '',
            authUser: t.auth?.type === 'basic' ? t.auth.username : '',
            authPass: t.auth?.type === 'basic' ? t.auth.password : '',
            authHeader: t.auth?.type === 'hmac' ? t.auth.header : 'X-Signature',
            authScheme: t.auth?.type === 'hmac' ? t.auth.scheme : 'hex',
            authSecret: '',
            timeoutMs: t.timeoutMs ?? 10000,
            retries: t.retries ?? 3,
            sampleBody: SAMPLE_BODY,
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
    const headers = parseHeaders(t.headers)
    return {
      channel: 'http',
      url: t.url,
      method: t.method,
      bodyExpr: t.bodyExpr || undefined,
      bodyTpl: t.bodyTpl || undefined,
      contentType: t.contentType,
      ...(headers ? { headers } : {}),
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
  const [showJson, setShowJson] = React.useState(false)
  const [tryIt, setTryIt] = React.useState<Record<number, boolean>>({})
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  React.useEffect(() => {
    if (open) {
      setForm(editing ? toForm(editing) : EMPTY)
      setShowJson(false)
      setTryIt({})
    }
  }, [open, editing])

  const payloadPreview = JSON.stringify(buildPayload(form, Boolean(editing)), null, 2)

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
    onError: (e: Error) => {
      const detail = (e as ApiError).detail as { issues?: { path: (string | number)[]; message: string }[] } | undefined
      let desc = e.message
      if (detail?.issues?.length) {
        const first = detail.issues[0]
        desc = first.path.join('.').replace(/targets\.(\d+)/, '转发目标 $1') + '：' + first.message
      }
      toast.error('保存失败', { description: desc })
    },
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.subpath.trim() || !form.title.trim()) return toast.error('请填写子路径与标题')
    if (form.targets.length === 0) return toast.error('至少配置一个转发目标')
    const targetErrs = validateTargets(form.targets)
    if (targetErrs.length) return toast.error('配置有误', { description: targetErrs[0] })
    if (form.authType === 'hmac' && !editing && !form.hmacSecret.trim()) return toast.error('HMAC 校验需填写密钥')
    mutation.mutate()
  }

  /* ---- targets 操作 ---- */
  const updateTarget = (i: number, patch: Partial<TargetForm>) =>
    setForm(f => ({ ...f, targets: f.targets.map((t, idx) => (idx === i ? ({ ...t, ...patch } as TargetForm) : t)) }))
  const addTarget = () => setForm(f => ({ ...f, targets: [...f.targets, emptyHttpTarget()] }))
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
            <p className="text-muted-foreground text-xs leading-relaxed">
              把任意来源的入站请求归一为命名变量，供下游转发使用。取值来源=请求体时，
              <span className="text-foreground">根节点就是请求体本身</span>。
            </p>
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
                    placeholder="message（根=请求体）"
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
              <p className="text-muted-foreground text-xs leading-relaxed">
                例：对方 POST <code className="rounded bg-white/10 px-1">{'{"message":"hi"}'}</code> ，填
                <code className="rounded bg-white/10 px-1">message</code> 即可；嵌套
                <code className="rounded bg-white/10 px-1">a.b.c</code>，数组
                <code className="rounded bg-white/10 px-1">a[0].b</code>。
                <span className="text-foreground">未配置映射时，请求体顶层字段会自动作为变量使用</span>（如直接写{' '}
                <code className="rounded bg-white/10 px-1">{'{{message}}'}</code>）。
              </p>
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
                      <Label>邮件主题模板（支持 {'{{变量}}'}）</Label>
                      <Input value={t.subjectTpl} onChange={e => updateTarget(i, { subjectTpl: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>邮件正文模板（支持 {'{{变量}}'}）</Label>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        未配置映射时，可直接写请求体顶层字段（如{' '}
                        <code className="rounded bg-white/10 px-1">{'{{message}}'}</code>）
                        ；已配置映射则优先使用映射变量名。
                      </p>
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
                        <Label title="从事件上下文抽取子树作为发送体">抽取表达式 bodyExpr（可选）</Label>
                        <Input
                          value={t.bodyExpr}
                          onChange={e => updateTarget(i, { bodyExpr: e.target.value })}
                          placeholder="body.message"
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
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      根节点是<span className="text-foreground">事件上下文</span>：
                      <code className="rounded bg-white/10 px-1">body.xxx</code>
                      取请求体字段，或直接写映射出的变量名（如 <code className="rounded bg-white/10 px-1">text</code>
                      ）。未配置映射时，请求体顶层字段会自动作为变量（如{' '}
                      <code className="rounded bg-white/10 px-1">{'{{message}}'}</code>
                      直接取 <code className="rounded bg-white/10 px-1">body.message</code>）。留空则发送整个请求体。
                    </p>
                    <div className="space-y-2">
                      <Label>Body 模板（支持 {'{{变量}}'}）</Label>
                      <JsonEditor
                        value={t.bodyTpl}
                        onChange={v => updateTarget(i, { bodyTpl: v })}
                        tolerant
                        minHeight="120px"
                        placeholder='{"text":"{{message}}"}'
                      />
                    </div>

                    {/* 试一试：样例数据实时渲染预览 */}
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setTryIt(s => ({ ...s, [i]: !s[i] }))}>
                        <Code2 className="h-3.5 w-3.5" />
                        {tryIt[i] ? '收起试一试' : '试一试：粘贴样例入站数据预览出站 Body'}
                      </Button>
                      {tryIt[i] && (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-xs">样例入站数据（JSON）</Label>
                            <Textarea
                              value={t.sampleBody}
                              onChange={e => updateTarget(i, { sampleBody: e.target.value })}
                              className="font-mono text-xs"
                              rows={8}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">出站 Body 预览</Label>
                            <TryPreview target={t} />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>请求头 Headers（JSON 对象，可选）</Label>
                      <JsonEditor
                        value={t.headers}
                        onChange={v => updateTarget(i, { headers: v })}
                        minHeight="80px"
                        placeholder='{"X-Api-Key":"secret"}'
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

          {/* 配置 JSON 预览 */}
          <section className="space-y-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowJson(s => !s)}>
              <Code2 className="h-3.5 w-3.5" />
              {showJson ? '收起配置 JSON' : '查看配置 JSON（无需手写，仅供参考）'}
            </Button>
            {showJson && <JsonEditor value={payloadPreview} readOnly minHeight="180px" />}
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

/* 出站 Body 实时预览（与后端 http.ts 的 buildBody 对齐） */
function TryPreview({ target }: { target: HttpTargetForm }) {
  const sample = parseSample(target.sampleBody)
  const { ok, output } = previewHttpBody({
    bodyExpr: target.bodyExpr,
    bodyTpl: target.bodyTpl,
    contentType: target.contentType,
    sampleBody: sample,
  })
  return (
    <pre className="glass-soft text-foreground/90 max-h-56 overflow-auto rounded-xl border border-white/10 p-3 font-mono text-xs">
      {ok ? output : <span className="text-destructive/90">{output || '（样例数据无效）'}</span>}
    </pre>
  )
}
