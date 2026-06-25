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
import { applyUpdater } from '@/lib/updater'
import type { Updater } from '@/lib/updater'
import type { ElementForm, SimForm, TariffForm } from '@/model/forms'

function defaultElementIndex(tariff: TariffForm): number {
  const unrestricted = tariff.elements.findIndex((element) => element.restriction == null)
  return unrestricted >= 0 ? unrestricted : 0
}

function restoreAt<T>(items: T[], index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)]
}

export interface TariffSetupProps {
  value: SimForm
  onChange(next: Updater<SimForm>): void
  onOpenAdvancedTariffs(): void
}

export function TariffSetup({ value, onChange, onOpenAdvancedTariffs }: TariffSetupProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const primaryTariff = value.tariffs[0]

  const updatePrimaryTariff = (next: Updater<TariffForm>) =>
    onChange((prev) => ({
      ...prev,
      tariffs: prev.tariffs.map((existing, index) => (index === 0 ? applyUpdater(next, existing) : existing)),
    }))

  const removePrimaryTariff = () => {
    if (!primaryTariff) return
    onChange((prev) => ({ ...prev, tariffs: prev.tariffs.filter((_, index) => index !== 0) }))
    toast('Tariff deleted', {
      action: {
        label: 'Undo',
        onClick: () => onChange((prev) => ({ ...prev, tariffs: restoreAt(prev.tariffs, 0, primaryTariff) })),
      },
    })
  }

  if (!primaryTariff) {
    return (
      <Card className="rounded-md">
        <CardHeader className="p-4">
          <CardTitle className="text-base">Tariff setup</CardTitle>
          <CardDescription>Define the tariff plan used to price the session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
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

  const updateDefaultElement = (next: Updater<ElementForm>) =>
    updatePrimaryTariff((prevTariff) => {
      const index = defaultElementIndex(prevTariff)
      const elements = prevTariff.elements.length
        ? prevTariff.elements.map((existing, currentIndex) =>
            currentIndex === index ? applyUpdater(next, existing) : existing,
          )
        : [applyUpdater(next, { components: [] })]
      return { ...prevTariff, elements }
    })

  return (
    <>
      <Card className="rounded-md">
        <CardHeader className="flex-row items-start justify-between space-y-0 p-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Tariff setup</CardTitle>
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
        <CardContent className="space-y-4 p-4 pt-0">
          <div className="max-w-sm space-y-2">
            <Label htmlFor="primary-tariff-name">Tariff name</Label>
            <Input
              id="primary-tariff-name"
              value={primaryTariff.id}
              onChange={(event) => {
                const id = event.currentTarget.value
                updatePrimaryTariff((prev) => ({ ...prev, id }))
              }}
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
              onChange={(next) =>
                updateDefaultElement((prevElement) => ({
                  ...prevElement,
                  components: applyUpdater(next, prevElement.components),
                }))
              }
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
