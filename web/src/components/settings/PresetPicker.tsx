import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/controls/NativeSelect'
import { presetMeta, presets } from '@/presets'

export interface PresetPickerProps {
  value: string
  isCustom: boolean
  onChange(key: string): void
}

function metaFor(key: string) {
  return presetMeta[key] ?? { label: key, description: 'Custom pricing scenario.' }
}

export function PresetPicker({ value, isCustom, onChange }: PresetPickerProps) {
  const [pendingPreset, setPendingPreset] = useState<string | null>(null)
  const selectedMeta = metaFor(value)

  const choosePreset = (key: string) => {
    if (key === value) return
    if (isCustom) {
      setPendingPreset(key)
      return
    }
    onChange(key)
  }

  const applyPendingPreset = () => {
    if (pendingPreset == null) return
    onChange(pendingPreset)
    setPendingPreset(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="header-preset">Preset</Label>
        {isCustom && (
          <Badge variant="secondary" aria-label="Preset has custom edits">
            Custom
          </Badge>
        )}
      </div>
      <NativeSelect id="header-preset" value={value} onChange={(event) => choosePreset(event.currentTarget.value)}>
        {Object.keys(presets).map((key) => {
          const meta = metaFor(key)
          return (
            <option key={key} value={key}>
              {meta.label} - {meta.description}
            </option>
          )
        })}
      </NativeSelect>
      <Card className="rounded-md shadow-none">
        <CardContent className="p-3">
          <p className="text-xs font-medium">{selectedMeta.label}</p>
          <p className="text-xs text-muted-foreground">{selectedMeta.description}</p>
        </CardContent>
      </Card>

      <AlertDialog open={pendingPreset != null} onOpenChange={(open) => !open && setPendingPreset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This overwrites your current input</AlertDialogTitle>
            <AlertDialogDescription>
              Applying {pendingPreset ? metaFor(pendingPreset).label : 'this preset'} replaces the current form values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyPendingPreset}>Apply preset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
