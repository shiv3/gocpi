import { useId } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

export type JsonSyncStatus = 'synced' | 'unsaved' | 'invalid'

export interface JsonPanelProps {
  text: string
  onChange(text: string): void
  parseError?: string
  syncStatus?: JsonSyncStatus
}

function syncStatusLabel(status: JsonSyncStatus): string {
  if (status === 'invalid') return 'Invalid JSON'
  if (status === 'unsaved') return 'Unsaved changes'
  return 'Synced'
}

function syncStatusVariant(status: JsonSyncStatus) {
  if (status === 'invalid') return 'destructive' as const
  if (status === 'unsaved') return 'outline' as const
  return 'secondary' as const
}

export function JsonPanel({ text, onChange, parseError, syncStatus = parseError ? 'invalid' : 'synced' }: JsonPanelProps) {
  const textareaId = useId()

  return (
    <Card className="rounded-md" aria-labelledby="json-panel-heading">
      <CardHeader className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle id="json-panel-heading" className="text-base">
            CDR JSON
          </CardTitle>
          <Badge variant="outline">Developer mode</Badge>
          <Badge variant={syncStatusVariant(syncStatus)}>{syncStatusLabel(syncStatus)}</Badge>
        </div>
        <CardDescription>Edit the serialized CDR directly when you need to inspect or test the engine payload.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <Label htmlFor={textareaId}>JSON</Label>
        <textarea
          id={textareaId}
          value={text}
          spellCheck={false}
          className="min-h-[540px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        {parseError && (
          <Alert variant="destructive">
            <AlertTitle>Invalid JSON</AlertTitle>
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
