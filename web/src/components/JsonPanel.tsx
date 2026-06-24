import { useId } from 'react'

export interface JsonPanelProps {
  text: string
  onChange(text: string): void
  parseError?: string
}

export function JsonPanel({ text, onChange, parseError }: JsonPanelProps) {
  const textareaId = useId()

  return (
    <section className="json-panel" aria-labelledby="json-panel-heading">
      <h2 id="json-panel-heading">CDR JSON</h2>
      <label htmlFor={textareaId}>JSON</label>
      <textarea
        id={textareaId}
        value={text}
        spellCheck={false}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {parseError && (
        <p className="field-error" role="alert">
          {parseError}
        </p>
      )}
    </section>
  )
}
