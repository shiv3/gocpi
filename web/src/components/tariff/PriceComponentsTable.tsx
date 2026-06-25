import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { NativeSelect } from '@/components/controls/NativeSelect'
import type { Updater } from '@/lib/updater'
import { billingUnitHuman, priceUnitLabel } from '@/lib/units'
import type { ComponentForm, DimType } from '@/model/forms'

const PRICE_TYPES: DimType[] = ['ENERGY', 'TIME', 'PARKING_TIME', 'FLAT']

const defaultComponent = (): ComponentForm => ({ type: 'ENERGY', price: '0', stepSize: 1 })

function restoreAt<T>(items: T[], index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)]
}

export interface PriceComponentsTableProps {
  value: ComponentForm[]
  currency: string
  idPrefix?: string
  onChange(next: Updater<ComponentForm[]>): void
}

export function PriceComponentsTable({ value, currency, idPrefix = 'price-components', onChange }: PriceComponentsTableProps) {
  const setComponent = (index: number, component: ComponentForm) => {
    onChange((prev) => prev.map((existing, currentIndex) => (currentIndex === index ? component : existing)))
  }

  const setVat = (index: number, vat: string) => {
    const next = { ...value[index] }
    if (vat) {
      next.vat = vat
    } else {
      delete next.vat
    }
    setComponent(index, next)
  }

  const removeComponent = (index: number) => {
    const removed = value[index]
    if (!removed) return
    onChange((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
    toast('Price component deleted', {
      action: {
        label: 'Undo',
        onClick: () => onChange((prev) => restoreAt(prev, index, removed)),
      },
    })
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40">Price type</TableHead>
            <TableHead className="min-w-44">Unit price</TableHead>
            <TableHead className="min-w-48">Billing unit</TableHead>
            <TableHead className="min-w-32">VAT rate</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {value.map((component, index) => {
            const row = index + 1
            return (
              <TableRow key={index}>
                <TableCell>
                  <Label className="sr-only" htmlFor={`${idPrefix}-price-type-${index}`}>
                    Price type
                  </Label>
                  <NativeSelect
                    id={`${idPrefix}-price-type-${index}`}
                    value={component.type}
                    onChange={(event) => setComponent(index, { ...component, type: event.currentTarget.value as DimType })}
                  >
                    {PRICE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell>
                  <Label className="sr-only" htmlFor={`${idPrefix}-unit-price-${index}`}>
                    Unit price
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`${idPrefix}-unit-price-${index}`}
                      value={component.price}
                      onChange={(event) => setComponent(index, { ...component, price: event.currentTarget.value })}
                    />
                    <span className="min-w-20 whitespace-nowrap text-xs text-muted-foreground">
                      {priceUnitLabel(component.type, currency)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Label className="sr-only" htmlFor={`${idPrefix}-billing-unit-${index}`}>
                    Billing unit
                  </Label>
                  <div className="space-y-1">
                    <Input
                      id={`${idPrefix}-billing-unit-${index}`}
                      type="number"
                      min="1"
                      value={component.stepSize}
                      onChange={(event) => setComponent(index, { ...component, stepSize: Number(event.currentTarget.value) })}
                    />
                    <p className="text-xs text-muted-foreground">{billingUnitHuman(component.type, component.stepSize)}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Label className="sr-only" htmlFor={`${idPrefix}-vat-rate-${index}`}>
                    VAT rate
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`${idPrefix}-vat-rate-${index}`}
                      value={component.vat ?? ''}
                      onChange={(event) => setVat(index, event.currentTarget.value)}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    aria-label={`Delete price component ${row}`}
                    onClick={() => removeComponent(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange((prev) => [...prev, defaultComponent()])}>
        <Plus className="h-4 w-4" />
        Add price component
      </Button>
    </div>
  )
}
