import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Layers } from 'lucide-react'

export default function ModuleNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-5">
        <Layers className="h-8 w-8 text-muted-foreground/60" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Module not found</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        The module you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link href="/dashboard/modules">
        <Button variant="outline" className="rounded-xl">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Modules
        </Button>
      </Link>
    </div>
  )
}
