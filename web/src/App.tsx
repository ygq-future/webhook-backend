import { Routes, Route } from 'react-router-dom'
import { Button } from '@/components/ui/button'

function Dashboard() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Webhook 转发中心</h1>
      <p className="text-muted-foreground">脚手架已就绪（里程碑 M1）</p>
      <Button>新建子路径</Button>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
    </Routes>
  )
}
