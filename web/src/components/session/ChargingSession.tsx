import { MoreHorizontal } from 'lucide-react'
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
  const shouldHideTariffId = hideTariffId || tariffIds.length <= 1

  const setPeriod = (index: number, period: PeriodForm) => {
    onChange(value.map((existing, currentIndex) => (currentIndex === index ? period : existing)))
  }

  const removePeriod = (index: number) => {
    onChange(value.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <Card className="rounded-md">
      <CardHeader className="flex-row items-start justify-between space-y-0 p-5">
        <div className="space-y-1">
          <CardTitle className="text-lg">Charging session</CardTitle>
          <CardDescription>Describe when charging happened and how much was used.</CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, defaultPeriod(calculationStart, tariffIds[0])])}
        >
          Add charging period
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
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
                    <DropdownMenuItem onSelect={() => removePeriod(index)}>Delete charging period</DropdownMenuItem>
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
  )
}
