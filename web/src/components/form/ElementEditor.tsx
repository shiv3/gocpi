import type { ComponentForm, ElementForm } from '../../model/forms'
import { ComponentEditor } from './ComponentEditor'
import { RestrictionEditor } from './RestrictionEditor'

const defaultComponent = (): ComponentForm => ({ type: 'ENERGY', price: '0', stepSize: 1 })

export interface ElementEditorProps {
  value: ElementForm
  onChange(e: ElementForm): void
}

export function ElementEditor({ value, onChange }: ElementEditorProps) {
  const setComponent = (index: number, component: ComponentForm) => {
    onChange({
      ...value,
      components: value.components.map((existing, currentIndex) => (currentIndex === index ? component : existing)),
    })
  }

  const removeComponent = (index: number) => {
    onChange({ ...value, components: value.components.filter((_, currentIndex) => currentIndex !== index) })
  }

  return (
    <div className="element-editor">
      <RestrictionEditor value={value.restriction} onChange={(restriction) => onChange({ ...value, restriction })} />
      <div className="subsection-heading">
        <h4>price components</h4>
        <button type="button" onClick={() => onChange({ ...value, components: [...value.components, defaultComponent()] })}>
          Add component
        </button>
      </div>
      <div className="stack">
        {value.components.map((component, index) => (
          <div className="repeated-row" key={index}>
            <ComponentEditor value={component} onChange={(next) => setComponent(index, next)} />
            <button type="button" className="ghost-button" onClick={() => removeComponent(index)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
