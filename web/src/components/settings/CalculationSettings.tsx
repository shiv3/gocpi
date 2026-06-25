import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/controls/NativeSelect'
import { fromLocalInput, toLocalInput } from '@/lib/datetime'
import { COMMON_COUNTRY_CODES, COMMON_CURRENCIES, TIME_ZONES, optionsWithCurrent } from '@/lib/options'
import type { SimForm } from '@/model/forms'

export interface CalculationSettingsProps {
  value: SimForm
  timeZone: string
  onCurrencyChange(currency: string): void
  onCountryChange(countryCode: string): void
  onTimeZoneChange(timeZone: string): void
  onStartChange(start: string): void
  onEndChange(end: string): void
}

export function CalculationSettings({
  value,
  timeZone,
  onCurrencyChange,
  onCountryChange,
  onTimeZoneChange,
  onStartChange,
  onEndChange,
}: CalculationSettingsProps) {
  return (
    <Card className="rounded-md">
      <CardHeader className="space-y-1 p-4">
        <CardTitle className="text-base">Calculation settings</CardTitle>
        <CardDescription>Set the currency, country, and calculation period.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="calculation-currency">Currency</Label>
          <NativeSelect
            id="calculation-currency"
            value={value.currency}
            onChange={(event) => onCurrencyChange(event.currentTarget.value)}
          >
            {optionsWithCurrent(COMMON_CURRENCIES, value.currency).map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calculation-country">Country</Label>
          <NativeSelect
            id="calculation-country"
            value={value.countryCode}
            onChange={(event) => onCountryChange(event.currentTarget.value)}
          >
            {optionsWithCurrent(COMMON_COUNTRY_CODES, value.countryCode).map((countryCode) => (
              <option key={countryCode} value={countryCode}>
                {countryCode}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calculation-time-zone">Time zone</Label>
          <NativeSelect
            id="calculation-time-zone"
            value={timeZone}
            onChange={(event) => onTimeZoneChange(event.currentTarget.value)}
          >
            <option value="">(infer from country)</option>
            {TIME_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2 sm:col-start-1">
          <Label htmlFor="calculation-start">Start time</Label>
          <Input
            id="calculation-start"
            type="datetime-local"
            value={toLocalInput(value.start)}
            onChange={(event) => onStartChange(fromLocalInput(event.currentTarget.value))}
          />
          <p className="text-xs text-muted-foreground">UTC</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calculation-end">End time</Label>
          <Input
            id="calculation-end"
            type="datetime-local"
            value={toLocalInput(value.end)}
            onChange={(event) => onEndChange(fromLocalInput(event.currentTarget.value))}
          />
          <p className="text-xs text-muted-foreground">UTC</p>
        </div>
      </CardContent>
    </Card>
  )
}
