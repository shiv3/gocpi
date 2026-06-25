import { useState } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
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
import { NativeSelect } from '@/components/controls/NativeSelect'
import { fromLocalInput, toLocalInput } from '@/lib/datetime'
import type { PeriodForm } from '@/model/forms'
import { UsageTable } from './UsageTable'

const defaultDimension = () => ({ type: 'ENERGY' as const, volume: '0' })

function defaultPeriod(start: string, tariffId?: string): PeriodForm {
  return {
    start,
    tariffId,
    dimensions: [defaultDimension()],
  }
}

function restoreAt<T>(items: T[], index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)]
}

export interface ChargingSessionProps {
  value: PeriodForm[]
  calculationStart: string
  tariffIds: string[]
  hideTariffId?: boolean
  onChange(periods: PeriodForm[]): void
}

export function ChargingSession({
  value,
  calculationStart,
  tariffIds,
  hideTariffId = false,
  onChange,
}: ChargingSessionProps) {
  const [periodToDelete, setPeriodToDelete] = useState<number | null>(null)
  const shouldHideTariffId = hideTariffId || tariffIds.length <= 1

  const setPeriod = (index: number, period: PeriodForm) => {
    onChange(value.map((existing, currentIndex) => (currentIndex === index ? period : existing)))
  }

  const removePeriod = (index: number) => {
    const removed = value[index]
    if (!removed) return
    const next = value.filter((_, currentIndex) => currentIndex !== index)
    onChange(next)
    toast('Charging period deleted', {
      action: {
        label: 'Undo',
        onClick: () => onChange(restoreAt(next, index, removed)),
      },
    })
  }

  return (
    <>
      <Card className="rounded-md">
        <CardHeader className="flex-row items-start justify-between space-y-0 p-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Charging session</CardTitle>
            <CardDescription>Describe when charging happened and how much was used.</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...value, defaultPeriod(calculationStart, tariffIds[0])])}
          >
            <Plus className="h-4 w-4" />
            Add charging period
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
          {value.map((period, index) => {
            const availableTariffIds =
              period.tariffId && !tariffIds.includes(period.tariffId) ? [...tariffIds, period.tariffId] : tariffIds
            return (
              <section key={`${period.start}-${index}`} className="rounded-md border bg-background p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Charging period {index + 1}</h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Charging period ${index + 1} actions`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                          setPeriodToDelete(index)
                        }}
                      >
                        Delete charging period
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mb-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`period-start-${index}`}>Start time</Label>
                    <Input
                      id={`period-start-${index}`}
                      type="datetime-local"
                      value={toLocalInput(period.start)}
                      onChange={(event) => setPeriod(index, { ...period, start: fromLocalInput(event.currentTarget.value) })}
                    />
                    <p className="text-xs text-muted-foreground">UTC</p>
                  </div>
                  {!shouldHideTariffId && (
                    <div className="space-y-2">
                      <Label htmlFor={`period-tariff-${index}`}>Tariff</Label>
                      <NativeSelect
                        id={`period-tariff-${index}`}
                        value={period.tariffId ?? ''}
                        onChange={(event) => setPeriod(index, { ...period, tariffId: event.currentTarget.value || undefined })}
                      >
                        <option value="">(none)</option>
                        {availableTariffIds.map((tariffId) => (
                          <option key={tariffId} value={tariffId}>
                            {tariffId}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Usage</h4>
                  <UsageTable
                    idPrefix={`period-${index}`}
                    value={period.dimensions}
                    onChange={(dimensions) => setPeriod(index, { ...period, dimensions })}
                  />
                </div>
              </section>
            )
          })}
        </CardContent>
      </Card>

      <AlertDialog open={periodToDelete != null} onOpenChange={(open) => !open && setPeriodToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete charging period?</AlertDialogTitle>
            <AlertDialogDescription>
              Charging period {periodToDelete == null ? '' : periodToDelete + 1} will be removed from this scenario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (periodToDelete != null) {
                  removePeriod(periodToDelete)
                }
                setPeriodToDelete(null)
              }}
            >
              Delete charging period
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
