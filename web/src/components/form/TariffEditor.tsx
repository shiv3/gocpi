import type { ElementForm, TariffForm, TaxIncluded } from '../../model/forms'
import type { Version } from '../../wasm/api'
import { COMMON_CURRENCIES, optionsWithCurrent } from '../../lib/options'
import { ElementEditor } from './ElementEditor'

const TAX_INCLUDED: TaxIncluded[] = ['YES', 'NO', 'N/A']

const defaultElement = (): ElementForm => ({
  components: [{ type: 'ENERGY', price: '0', stepSize: 1 }],
})

export interface TariffEditorProps {
  value: TariffForm
  version: Version
  onChange(t: TariffForm): void
}

export function TariffEditor({ value, version, onChange }: TariffEditorProps) {
  const set = (patch: Partial<TariffForm>) => onChange({ ...value, ...patch })
  const setOptionalPrice = (key: 'minPrice' | 'maxPrice', price: string) => {
    const next: TariffForm = { ...value }
    if (price) {
      next[key] = price
    } else {
      delete next[key]
    }
    onChange(next)
  }

  const setElement = (index: number, element: ElementForm) => {
    onChange({
      ...value,
      elements: value.elements.map((existing, currentIndex) => (currentIndex === index ? element : existing)),
    })
  }

  const removeElement = (index: number) => {
    onChange({ ...value, elements: value.elements.filter((_, currentIndex) => currentIndex !== index) })
  }

  return (
    <section className="tariff-editor">
      <div className="form-grid">
        <label>
          tariff id
          <input value={value.id} onChange={(event) => set({ id: event.currentTarget.value })} />
        </label>
        <label>
          currency
          <select value={value.currency} onChange={(event) => set({ currency: event.currentTarget.value })}>
            {optionsWithCurrent(COMMON_CURRENCIES, value.currency).map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        <label>
          min price
          <input value={value.minPrice ?? ''} onChange={(event) => setOptionalPrice('minPrice', event.currentTarget.value)} />
        </label>
        <label>
          max price
          <input value={value.maxPrice ?? ''} onChange={(event) => setOptionalPrice('maxPrice', event.currentTarget.value)} />
        </label>
        {version === '2.3.0' && (
          <label>
            tax included
            <select
              value={value.taxIncluded}
              onChange={(event) => set({ taxIncluded: event.currentTarget.value as TaxIncluded })}
            >
              {TAX_INCLUDED.map((taxIncluded) => (
                <option key={taxIncluded} value={taxIncluded}>
                  {taxIncluded}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="subsection-heading">
        <h4>tariff elements</h4>
        <button type="button" onClick={() => onChange({ ...value, elements: [...value.elements, defaultElement()] })}>
          Add element
        </button>
      </div>
      <div className="stack">
        {value.elements.map((element, index) => (
          <details className="collapsible-row collapsible-row--nested" key={index} open>
            <summary>
              Element {index + 1} ({element.components.length} components)
            </summary>
            <div className="collapsible-row__body">
              <ElementEditor value={element} onChange={(next) => setElement(index, next)} />
              <div className="row-actions">
                <button type="button" className="ghost-button" onClick={() => removeElement(index)}>
                  Remove element
                </button>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
