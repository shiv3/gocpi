import type { EmbeddedTotalsForm } from '../../model/forms'

const FIELDS: { key: keyof EmbeddedTotalsForm; label: string }[] = [
  { key: 'totalCost', label: 'total_cost' },
  { key: 'totalEnergy', label: 'total_energy' },
  { key: 'totalTime', label: 'total_time' },
  { key: 'totalEnergyCost', label: 'total_energy_cost' },
  { key: 'totalTimeCost', label: 'total_time_cost' },
  { key: 'totalParkingCost', label: 'total_parking_cost' },
  { key: 'totalFixedCost', label: 'total_fixed_cost' },
]

export interface EmbeddedTotalsEditorProps {
  value: EmbeddedTotalsForm
  onChange(e: EmbeddedTotalsForm): void
}

export function EmbeddedTotalsEditor({ value, onChange }: EmbeddedTotalsEditorProps) {
  const setField = (key: keyof EmbeddedTotalsForm, inputValue: string) => {
    const next: EmbeddedTotalsForm = { ...value }
    if (inputValue) {
      next[key] = inputValue
    } else {
      delete next[key]
    }
    onChange(next)
  }

  return (
    <details className="embedded-totals-editor">
      <summary>embedded totals</summary>
      <div className="form-grid">
        {FIELDS.map((field) => (
          <label key={field.key}>
            {field.label}
            <input value={value[field.key] ?? ''} onChange={(event) => setField(field.key, event.currentTarget.value)} />
          </label>
        ))}
      </div>
    </details>
  )
}
