'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Bell, Building2, ChevronRight, FolderKanban, Search, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ManageableClient } from '@/app/actions/client-notification-preferences'
import type { UserRole } from '@/lib/types'

interface ClientsManagementClientProps {
  clients: ManageableClient[]
  role: UserRole
}

export function ClientsManagementClient({ clients, role }: ClientsManagementClientProps) {
  const [search, setSearch] = useState('')
  const isManager = role === 'project_manager'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.projectNames.some(p => p.toLowerCase().includes(q)),
    )
  }, [clients, search])

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden card-shadow p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Users className="h-4 w-4 text-primary" />
            <span>
              <span className="font-medium text-foreground">{clients.length}</span> {clients.length === 1 ? 'client' : 'clients'}
              {isManager && ' you manage'}
            </span>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email or project..."
              className="pl-9 h-9 rounded-lg bg-muted/20 border-border/50"
            />
          </div>
        </div>
      </div>

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 rounded-2xl bg-muted/30">
              <Building2 className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <p className="font-semibold text-foreground">
              {clients.length === 0
                ? isManager
                  ? 'No clients assigned to your projects yet'
                  : 'No clients yet'
                : 'No clients match your search'}
            </p>
            <p className="text-sm text-muted-foreground max-w-md">
              {clients.length === 0
                ? isManager
                  ? 'When a client is assigned to a project you manage, they will appear here and you can manage their notification preferences.'
                  : 'Client accounts appear here. Select a client to manage their notification preferences.'
                : 'Try adjusting your search criteria.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(client => (
            <div
              key={client.id}
              data-tour="client-notification-card"
              className="rounded-xl bg-white dark:bg-slate-900 border border-border/70 card-shadow overflow-hidden flex flex-col"
            >
              <div className="p-5 flex-1">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold">
                      {client.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{client.email}</p>
                    <span className="inline-flex items-center px-2 py-0.5 mt-2 rounded-full text-[10px] font-medium uppercase tracking-wide bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30">
                      Client
                    </span>
                  </div>
                </div>

                {isManager && (
                  <div className="mt-4 pt-3 border-t border-border/50">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                      <FolderKanban className="h-3 w-3" />
                      Projects
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {client.projectNames.length > 0 ? (
                        client.projectNames.slice(0, 3).map(p => (
                          <span
                            key={p}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-muted/30 border border-border/50 text-muted-foreground max-w-full"
                          >
                            <span className="truncate">{p}</span>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      )}
                      {client.projectNames.length > 3 && (
                        <span className="text-[11px] text-muted-foreground self-center">
                          +{client.projectNames.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-5 pb-5">
                <Button asChild variant="outline" className="w-full rounded-lg" size="sm">
                  <Link
                    href={`/dashboard/clients/${client.id}/notification-preferences`}
                    className="flex items-center justify-center gap-2"
                  >
                    <Bell className="h-4 w-4 text-primary" />
                    Notification Preferences
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
