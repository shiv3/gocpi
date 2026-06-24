import type { DimensionForm, DimType, PeriodForm } from '../../model/forms'

const DIMENSION_TYPES: DimensionForm['type'][] = ['ENERGY', 'TIME', 'PARKING_TIME']

const defaultDimension = (): DimensionForm => ({ type: 'ENERGY', volume: '0' })

export interface ChargingPeriodEditorProps {
  value: PeriodForm
  tariffIds: string[]
  onChange(p: PeriodForm): void
}

export function ChargingPeriodEditor({ value, tariffIds, onChange }: ChargingPeriodEditorProps) {
  const availableTariffIds = value.tariffId && !tariffIds.includes(value.tariffId) ? [...tariffIds, value.tariffId] : tariffIds

  const setDimension = (index: number, dimension: DimensionForm) => {
    onChange({
      ...value,
      dimensions: value.dimensions.map((existing, currentIndex) => (currentIndex === index ? dimension : existing)),
    })
  }

  const removeDimension = (index: number) => {
    onChange({ ...value, dimensions: value.dimensions.filter((_, currentIndex) => currentIndex !== index) })
  }

  return (
    <section className="period-editor">
      <div className="form-grid">
        <label>
          start
          <input value={value.start} onChange={(event) => onChange({ ...value, start: event.currentTarget.value })} />
        </label>
        <label>
          tariff_id
          <select
            value={value.tariffId ?? ''}
            onChange={(event) => onChange({ ...value, tariffId: event.currentTarget.value || undefined })}
          >
            <option value="">(none)</option>
            {availableTariffIds.map((tariffId) => (
              <option key={tariffId} value={tariffId}>
                {tariffId}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="subsection-heading">
        <h4>dimensions</h4>
        <button type="button" onClick={() => onChange({ ...value, dimensions: [...value.dimensions, defaultDimension()] })}>
          Add dimension
        </button>
      </div>
      <div className="stack">
        {value.dimensions.map((dimension, index) => (
          <div className="dimension-row" key={index}>
            <label>
              type
              <select
                value={dimension.type}
                onChange={(event) =>
                  setDimension(index, { ...dimension, type: event.currentTarget.value as Exclude<DimType, 'FLAT'> })
                }
              >
                {DIMENSION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              volume
              <input value={dimension.volume} onChange={(event) => setDimension(index, { ...dimension, volume: event.currentTarget.value })} />
            </label>
            <button type="button" className="ghost-button" onClick={() => removeDimension(index)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
