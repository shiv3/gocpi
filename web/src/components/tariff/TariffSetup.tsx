import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PriceComponentsTable } from './PriceComponentsTable'
import type { ElementForm, SimForm, TariffForm } from '@/model/forms'

function defaultElementIndex(tariff: TariffForm): number {
  const unrestricted = tariff.elements.findIndex((element) => element.restriction == null)
  return unrestricted >= 0 ? unrestricted : 0
}

export interface TariffSetupProps {
  value: SimForm
  onChange(form: SimForm): void
  onOpenAdvancedTariffs(): void
}

export function TariffSetup({ value, onChange, onOpenAdvancedTariffs }: TariffSetupProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const primaryTariff = value.tariffs[0]

  const setPrimaryTariff = (tariff: TariffForm) => {
    onChange({ ...value, tariffs: value.tariffs.map((existing, index) => (index === 0 ? tariff : existing)) })
  }

  const removePrimaryTariff = () => {
    if (!primaryTariff) return
    onChange({ ...value, tariffs: value.tariffs.slice(1) })
    toast('Tariff deleted', {
      action: {
        label: 'Undo',
        onClick: () => onChange({ ...value, tariffs: [primaryTariff, ...value.tariffs.slice(1)] }),
      },
    })
  }

  if (!primaryTariff) {
    return (
      <Card className="rounded-md">
        <CardHeader className="p-5">
          <CardTitle className="text-lg">Tariff setup</CardTitle>
          <CardDescription>Define the tariff plan used to price the session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-5 pt-0">
          <p className="text-sm text-muted-foreground">No primary tariff configured.</p>
          <Button type="button" variant="outline" onClick={onOpenAdvancedTariffs}>
            Edit additional tariffs &amp; rules in Advanced
          </Button>
        </CardContent>
      </Card>
    )
  }

  const elementIndex = defaultElementIndex(primaryTariff)
  const element = primaryTariff.elements[elementIndex] ?? { components: [] }
  const hasAdditionalTariffsOrRules =
    value.tariffs.length > 1 ||
    primaryTariff.elements.length > 1 ||
    Boolean(primaryTariff.elements[elementIndex]?.restriction)

  const setDefaultElement = (nextElement: ElementForm) => {
    const elements = primaryTariff.elements.length
      ? primaryTariff.elements.map((existing, index) => (index === elementIndex ? nextElement : existing))
      : [nextElement]
    setPrimaryTariff({ ...primaryTariff, elements })
  }

  return (
    <>
      <Card className="rounded-md">
        <CardHeader className="flex-row items-start justify-between space-y-0 p-5">
          <div className="space-y-1">
            <CardTitle className="text-lg">Tariff setup</CardTitle>
            <CardDescription>Define the tariff plan used to price the session.</CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Tariff actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  setConfirmDeleteOpen(true)
                }}
              >
                Delete tariff
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="space-y-5 p-5 pt-0">
          <div className="max-w-sm space-y-2">
            <Label htmlFor="primary-tariff-name">Tariff name</Label>
            <Input
              id="primary-tariff-name"
              value={primaryTariff.id}
              onChange={(event) => setPrimaryTariff({ ...primaryTariff, id: event.currentTarget.value })}
            />
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Price components</h3>
              <p className="text-xs text-muted-foreground">
                Edits the primary tariff&apos;s default rule.
              </p>
            </div>
            <PriceComponentsTable
              idPrefix="primary-tariff-components"
              value={element.components}
              currency={primaryTariff.currency || value.currency}
              onChange={(components) => setDefaultElement({ ...element, components })}
            />
          </div>

          {hasAdditionalTariffsOrRules && (
            <div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm">
              <p className="text-muted-foreground">
                Additional tariffs or tariff rules are configured.
              </p>
              <Button type="button" variant="link" className="h-auto p-0" onClick={onOpenAdvancedTariffs}>
                Edit additional tariffs &amp; rules in Advanced
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tariff?</AlertDialogTitle>
            <AlertDialogDescription>{primaryTariff.id} will be removed from this scenario.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={removePrimaryTariff}
            >
              Delete tariff
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
