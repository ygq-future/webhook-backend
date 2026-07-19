import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Webhook, Mail, CheckCircle2, XCircle } from 'lucide-react'

import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { statsApi } from '@/lib/api'

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: typeof Webhook
  tone?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`glass-soft flex h-12 w-12 items-center justify-center rounded-2xl ${tone ?? ''}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-muted-foreground text-xs">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({ queryKey: ['stats'], queryFn: statsApi.get, refetchInterval: 10000 })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">仪表盘</h1>
        <p className="text-muted-foreground text-sm">转发概览与最近日志</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="子路径" value={data?.endpoints ?? 0} icon={Webhook} />
        <StatCard label="邮箱账号" value={data?.accounts ?? 0} icon={Mail} />
        <StatCard label="转发成功" value={data?.success ?? 0} icon={CheckCircle2} tone="text-emerald-500" />
        <StatCard label="转发失败" value={data?.failed ?? 0} icon={XCircle} tone="text-destructive" />
      </div>

      <Card>
        <div className="flex items-center justify-between p-6 pb-2">
          <CardTitle className="text-base">最近转发日志</CardTitle>
          <Button variant="outline" size="sm" onClick={() => navigate('/logs')}>
            查看全部
          </Button>
        </div>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>渠道</TableHead>
                <TableHead>目标</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>详情</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-center">
                    加载中…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (data?.recent.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-center">
                    暂无日志
                  </TableCell>
                </TableRow>
              )}
              {data?.recent.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </TableCell>
                  <TableCell>{log.channel ?? '-'}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{log.target ?? '-'}</TableCell>
                  <TableCell>
                    {log.status === 'success' ? (
                      <Badge variant="success">成功</Badge>
                    ) : (
                      <Badge variant="destructive">失败</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[240px] truncate">{log.error ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
