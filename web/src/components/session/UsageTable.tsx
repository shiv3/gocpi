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
import { usageUnitLabel } from '@/lib/units'
import type { DimensionForm, DimType } from '@/model/forms'

const USAGE_TYPES: DimensionForm['type'][] = ['ENERGY', 'TIME', 'PARKING_TIME']

const defaultDimension = (): DimensionForm => ({ type: 'ENERGY', volume: '0' })

function restoreAt<T>(items: T[], index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)]
}

export interface UsageTableProps {
  value: DimensionForm[]
  idPrefix?: string
  onChange(next: Updater<DimensionForm[]>): void
}

export function UsageTable({ value, idPrefix = 'usage', onChange }: UsageTableProps) {
  const setDimension = (index: number, dimension: DimensionForm) => {
    onChange((prev) => prev.map((existing, currentIndex) => (currentIndex === index ? dimension : existing)))
  }

  const removeDimension = (index: number) => {
    const removed = value[index]
    if (!removed) return
    onChange((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
    toast('Usage item deleted', {
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
            <TableHead className="min-w-40">Usage type</TableHead>
            <TableHead className="min-w-52">Usage amount</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {value.map((dimension, index) => (
            <TableRow key={index}>
              <TableCell>
                <Label className="sr-only" htmlFor={`${idPrefix}-usage-type-${index}`}>
                  Usage type
                </Label>
                <NativeSelect
                  id={`${idPrefix}-usage-type-${index}`}
                  value={dimension.type}
                  onChange={(event) =>
                    setDimension(index, {
                      ...dimension,
                      type: event.currentTarget.value as Exclude<DimType, 'FLAT'>,
                    })
                  }
                >
                  {USAGE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </NativeSelect>
              </TableCell>
              <TableCell>
                <Label className="sr-only" htmlFor={`${idPrefix}-usage-amount-${index}`}>
                  Usage amount
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`${idPrefix}-usage-amount-${index}`}
                    value={dimension.volume}
                    onChange={(event) => setDimension(index, { ...dimension, volume: event.currentTarget.value })}
                  />
                  <span className="min-w-14 text-xs text-muted-foreground">{usageUnitLabel(dimension.type)}</span>
                </div>
              </TableCell>
              <TableCell>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  aria-label={`Delete usage item ${index + 1}`}
                  onClick={() => removeDimension(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange((prev) => [...prev, defaultDimension()])}>
        <Plus className="h-4 w-4" />
        Add usage item
      </Button>
    </div>
  )
}
