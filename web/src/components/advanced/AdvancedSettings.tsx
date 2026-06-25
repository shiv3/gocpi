import { useState } from 'react'
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { NativeSelect } from '@/components/controls/NativeSelect'
import { PriceComponentsTable } from '@/components/tariff/PriceComponentsTable'
import { COMMON_CURRENCIES, optionsWithCurrent } from '@/lib/options'
import { applyUpdater } from '@/lib/updater'
import type { Updater } from '@/lib/updater'
import type {
  ElementForm,
  EmbeddedTotalsForm,
  RestrictionForm,
  SimForm,
  TariffForm,
  TaxIncluded,
} from '@/model/forms'
import type { Version } from '@/wasm/api'

export type AdvancedSection =
  | 'tariff-source'
  | 'calculation-precision'
  | 'tariffs-rules'
  | 'embedded-totals'
  | 'ocpi-details'

export type TariffSourceMode = 'embedded' | 'override'

const MONEY_DECIMALS = [2, 3, 4] as const
const TAX_INCLUDED: TaxIncluded[] = ['YES', 'NO', 'N/A']

const EMBEDDED_FIELDS: { key: keyof EmbeddedTotalsForm; label: string }[] = [
  { key: 'totalCost', label: 'Total cost' },
  { key: 'totalEnergy', label: 'Total energy' },
  { key: 'totalTime', label: 'Total time' },
  { key: 'totalEnergyCost', label: 'Total energy cost' },
  { key: 'totalTimeCost', label: 'Total time cost' },
  { key: 'totalParkingCost', label: 'Total parking cost' },
  { key: 'totalFixedCost', label: 'Total fixed cost' },
]

function defaultElement(): ElementForm {
  return { components: [{ type: 'ENERGY', price: '0', stepSize: 1 }] }
}

function defaultTariff(currency: string, index: number): TariffForm {
  return {
    id: `tariff-${index + 1}`,
    currency: currency || 'EUR',
    taxIncluded: 'NO',
    elements: [defaultElement()],
  }
}

function setOptionalPrice(tariff: TariffForm, key: 'minPrice' | 'maxPrice', price: string): TariffForm {
  const next: TariffForm = { ...tariff }
  if (price) {
    next[key] = price
  } else {
    delete next[key]
  }
  return next
}

function setRestrictionField(
  restriction: RestrictionForm | undefined,
  key: keyof RestrictionForm,
  value: string,
): RestrictionForm {
  return { ...(restriction ?? {}), [key]: value || undefined }
}

function restoreAt<T>(items: T[], index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)]
}

export interface AdvancedSettingsProps {
  value: SimForm
  version: Version
  mode: TariffSourceMode
  currencyPrecision: number
  openValue?: AdvancedSection
  onOpenChange(value?: AdvancedSection): void
  onChange(next: Updater<SimForm>): void
  onModeChange(mode: TariffSourceMode): void
  onCurrencyPrecisionChange(precision: number): void
}

export function AdvancedSettings({
  value,
  version,
  mode,
  currencyPrecision,
  openValue,
  onOpenChange,
  onChange,
  onModeChange,
  onCurrencyPrecisionChange,
}: AdvancedSettingsProps) {
  const [tariffToDelete, setTariffToDelete] = useState<number | null>(null)

  const updateTariff = (tariffIndex: number, next: Updater<TariffForm>) =>
    onChange((prev) => ({
      ...prev,
      tariffs: prev.tariffs.map((existing, index) =>
        index === tariffIndex ? applyUpdater(next, existing) : existing,
      ),
    }))

  const removeTariff = (tariffIndex: number) => {
    const removed = value.tariffs[tariffIndex]
    if (!removed) return
    onChange((prev) => ({ ...prev, tariffs: prev.tariffs.filter((_, index) => index !== tariffIndex) }))
    toast('Tariff deleted', {
      action: {
        label: 'Undo',
        onClick: () => onChange((prev) => ({ ...prev, tariffs: restoreAt(prev.tariffs, tariffIndex, removed) })),
      },
    })
  }

  const setEmbeddedField = (key: keyof EmbeddedTotalsForm, inputValue: string) => {
    onChange((prev) => {
      const embedded: EmbeddedTotalsForm = { ...prev.embedded }
      if (inputValue) {
        embedded[key] = inputValue
      } else {
        delete embedded[key]
      }
      return { ...prev, embedded }
    })
  }

  return (
    <Card className="rounded-md">
      <CardHeader className="p-4">
        <CardTitle className="text-base">Advanced settings</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <Accordion
          type="single"
          collapsible
          value={openValue ?? ''}
          onValueChange={(next) => onOpenChange((next || undefined) as AdvancedSection | undefined)}
        >
          <AccordionItem value="tariff-source">
            <AccordionTrigger>Tariff source</AccordionTrigger>
            <AccordionContent>
              <div className="max-w-sm space-y-2">
                <Label htmlFor="advanced-tariff-source">Tariff source</Label>
                <NativeSelect
                  id="advanced-tariff-source"
                  value={mode}
                  onChange={(event) => onModeChange(event.currentTarget.value as TariffSourceMode)}
                >
                  <option value="embedded">Embedded</option>
                  <option value="override">Override</option>
                </NativeSelect>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="calculation-precision">
            <AccordionTrigger>Calculation precision</AccordionTrigger>
            <AccordionContent>
              <div className="max-w-sm space-y-2">
                <Label htmlFor="advanced-money-decimals">Money decimals</Label>
                <NativeSelect
                  id="advanced-money-decimals"
                  value={currencyPrecision}
                  onChange={(event) => onCurrencyPrecisionChange(Number(event.currentTarget.value))}
                >
                  {MONEY_DECIMALS.map((decimals) => (
                    <option key={decimals} value={decimals}>
                      {decimals}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="tariffs-rules">
            <AccordionTrigger>Tariffs &amp; rules</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onChange((prev) => ({
                        ...prev,
                        tariffs: [...prev.tariffs, defaultTariff(prev.currency, prev.tariffs.length)],
                      }))
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add tariff
                  </Button>
                </div>
                {value.tariffs.map((tariff, tariffIndex) => (
                  <section key={`${tariff.id}-${tariffIndex}`} className="rounded-md border bg-background p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-medium">Tariff {tariffIndex + 1}</h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" aria-label={`Tariff ${tariffIndex + 1} actions`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => {
                              setTariffToDelete(tariffIndex)
                            }}
                          >
                            Delete tariff
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <TariffRulesEditor
                      value={tariff}
                      version={version}
                      tariffIndex={tariffIndex}
                      onChange={(next) => updateTariff(tariffIndex, next)}
                    />
                  </section>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="embedded-totals">
            <AccordionTrigger>Embedded totals</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {EMBEDDED_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={`embedded-${field.key}`}>{field.label}</Label>
                    <Input
                      id={`embedded-${field.key}`}
                      value={value.embedded[field.key] ?? ''}
                      onChange={(event) => setEmbeddedField(field.key, event.currentTarget.value)}
                    />
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="ocpi-details">
            <AccordionTrigger>OCPI details</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                The form keeps the original simulator data model. Use the JSON tab for the serialized CDR payload.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
      <AlertDialog open={tariffToDelete != null} onOpenChange={(open) => !open && setTariffToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tariff?</AlertDialogTitle>
            <AlertDialogDescription>
              Tariff {tariffToDelete == null ? '' : tariffToDelete + 1} will be removed from this scenario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (tariffToDelete != null) {
                  removeTariff(tariffToDelete)
                }
                setTariffToDelete(null)
              }}
            >
              Delete tariff
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

interface TariffRulesEditorProps {
  value: TariffForm
  version: Version
  tariffIndex: number
  onChange(next: Updater<TariffForm>): void
}

function TariffRulesEditor({ value, version, tariffIndex, onChange }: TariffRulesEditorProps) {
  const set = (patch: Partial<TariffForm>) => onChange((prev) => ({ ...prev, ...patch }))

  const updateElement = (elementIndex: number, next: Updater<ElementForm>) =>
    onChange((prev) => ({
      ...prev,
      elements: prev.elements.map((existing, index) =>
        index === elementIndex ? applyUpdater(next, existing) : existing,
      ),
    }))

  const removeElement = (elementIndex: number) => {
    const removed = value.elements[elementIndex]
    if (!removed) return
    onChange((prev) => ({ ...prev, elements: prev.elements.filter((_, index) => index !== elementIndex) }))
    toast('Tariff rule deleted', {
      action: {
        label: 'Undo',
        onClick: () => onChange((prev) => ({ ...prev, elements: restoreAt(prev.elements, elementIndex, removed) })),
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`advanced-tariff-name-${tariffIndex}`}>Tariff name</Label>
          <Input
            id={`advanced-tariff-name-${tariffIndex}`}
            value={value.id}
            onChange={(event) => set({ id: event.currentTarget.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`advanced-tariff-currency-${tariffIndex}`}>Currency</Label>
          <NativeSelect
            id={`advanced-tariff-currency-${tariffIndex}`}
            value={value.currency}
            onChange={(event) => set({ currency: event.currentTarget.value })}
          >
            {optionsWithCurrent(COMMON_CURRENCIES, value.currency).map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`advanced-min-price-${tariffIndex}`}>Minimum price</Label>
          <Input
            id={`advanced-min-price-${tariffIndex}`}
            value={value.minPrice ?? ''}
            onChange={(event) => {
              const price = event.currentTarget.value
              onChange((prev) => setOptionalPrice(prev, 'minPrice', price))
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`advanced-max-price-${tariffIndex}`}>Maximum price</Label>
          <Input
            id={`advanced-max-price-${tariffIndex}`}
            value={value.maxPrice ?? ''}
            onChange={(event) => {
              const price = event.currentTarget.value
              onChange((prev) => setOptionalPrice(prev, 'maxPrice', price))
            }}
          />
        </div>
        {version === '2.3.0' && (
          <div className="space-y-2">
            <Label htmlFor={`advanced-tax-included-${tariffIndex}`}>Tax included</Label>
            <NativeSelect
              id={`advanced-tax-included-${tariffIndex}`}
              value={value.taxIncluded}
              onChange={(event) => set({ taxIncluded: event.currentTarget.value as TaxIncluded })}
            >
              {TAX_INCLUDED.map((taxIncluded) => (
                <option key={taxIncluded} value={taxIncluded}>
                  {taxIncluded}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-medium">Tariff rules</h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange((prev) => ({ ...prev, elements: [...prev.elements, defaultElement()] }))}
          >
            <Plus className="h-4 w-4" />
            Add tariff rule
          </Button>
        </div>
        <div className="space-y-4">
          {value.elements.map((element, elementIndex) => (
            <section key={elementIndex} className="rounded-md border p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h5 className="text-sm font-medium">Rule {elementIndex + 1}</h5>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  aria-label={`Delete tariff rule ${elementIndex + 1}`}
                  onClick={() => removeElement(elementIndex)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mb-4 space-y-3">
                <h6 className="text-sm font-medium">Applicability conditions</h6>
                <RestrictionFields
                  value={element.restriction}
                  idPrefix={`tariff-${tariffIndex}-element-${elementIndex}`}
                  onChange={(restriction) => updateElement(elementIndex, (prevElement) => ({ ...prevElement, restriction }))}
                />
              </div>
              <PriceComponentsTable
                idPrefix={`tariff-${tariffIndex}-element-${elementIndex}`}
                value={element.components}
                currency={value.currency}
                onChange={(next) =>
                  updateElement(elementIndex, (prevElement) => ({
                    ...prevElement,
                    components: applyUpdater(next, prevElement.components),
                  }))
                }
              />
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

interface RestrictionFieldsProps {
  value?: RestrictionForm
  idPrefix: string
  onChange(restriction?: RestrictionForm): void
}

function RestrictionFields({ value, idPrefix, onChange }: RestrictionFieldsProps) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value == null}
          onChange={(event) => onChange(event.currentTarget.checked ? undefined : {})}
        />
        No applicability conditions
      </label>
      {value != null && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-condition-start`}>Start time</Label>
            <Input
              id={`${idPrefix}-condition-start`}
              type="time"
              value={value.startTime ?? ''}
              onChange={(event) => onChange(setRestrictionField(value, 'startTime', event.currentTarget.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-condition-end`}>End time</Label>
            <Input
              id={`${idPrefix}-condition-end`}
              type="time"
              value={value.endTime ?? ''}
              onChange={(event) => onChange(setRestrictionField(value, 'endTime', event.currentTarget.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-condition-min-kwh`}>Minimum kWh</Label>
            <Input
              id={`${idPrefix}-condition-min-kwh`}
              value={value.minKwh ?? ''}
              onChange={(event) => onChange(setRestrictionField(value, 'minKwh', event.currentTarget.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-condition-max-kwh`}>Maximum kWh</Label>
            <Input
              id={`${idPrefix}-condition-max-kwh`}
              value={value.maxKwh ?? ''}
              onChange={(event) => onChange(setRestrictionField(value, 'maxKwh', event.currentTarget.value))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
