import type { RestrictionForm } from '../../model/forms'

export interface RestrictionEditorProps {
  value?: RestrictionForm
  onChange(r?: RestrictionForm): void
}

export function RestrictionEditor({ value, onChange }: RestrictionEditorProps) {
  const set = (patch: Partial<RestrictionForm>) => onChange({ ...(value ?? {}), ...patch })

  return (
    <fieldset className="restriction-editor">
      <legend>restriction</legend>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={value == null}
          onChange={(event) => onChange(event.currentTarget.checked ? undefined : {})}
        />
        no restriction
      </label>
      {value != null && (
        <div className="form-grid">
          <label>
            start_time
            <input
              type="time"
              value={value.startTime ?? ''}
              onChange={(event) => set({ startTime: event.currentTarget.value || undefined })}
            />
          </label>
          <label>
            end_time
            <input
              type="time"
              value={value.endTime ?? ''}
              onChange={(event) => set({ endTime: event.currentTarget.value || undefined })}
            />
          </label>
          <label>
            min_kwh
            <input value={value.minKwh ?? ''} onChange={(event) => set({ minKwh: event.currentTarget.value || undefined })} />
          </label>
          <label>
            max_kwh
            <input value={value.maxKwh ?? ''} onChange={(event) => set({ maxKwh: event.currentTarget.value || undefined })} />
          </label>
        </div>
      )}
    </fieldset>
  )
}
