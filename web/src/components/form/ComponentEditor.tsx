import type { ComponentForm, DimType } from '../../model/forms'

const TYPES: DimType[] = ['ENERGY', 'TIME', 'PARKING_TIME', 'FLAT']

export interface ComponentEditorProps {
  value: ComponentForm
  onChange(c: ComponentForm): void
}

export function ComponentEditor({ value, onChange }: ComponentEditorProps) {
  const set = (patch: Partial<ComponentForm>) => onChange({ ...value, ...patch })
  const setVat = (vat: string) => {
    const next: ComponentForm = { ...value }
    if (vat) {
      next.vat = vat
    } else {
      delete next.vat
    }
    onChange(next)
  }

  return (
    <div className="component-editor">
      <label>
        type
        <select value={value.type} onChange={(event) => set({ type: event.currentTarget.value as DimType })}>
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label>
        price
        <input value={value.price} onChange={(event) => set({ price: event.currentTarget.value })} />
      </label>
      <label>
        step_size
        <input
          type="number"
          min="1"
          value={value.stepSize}
          onChange={(event) => set({ stepSize: Number(event.currentTarget.value) })}
        />
      </label>
      <label>
        vat
        <input value={value.vat ?? ''} onChange={(event) => setVat(event.currentTarget.value)} />
      </label>
    </div>
  )
}
