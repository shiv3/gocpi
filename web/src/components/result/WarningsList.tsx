import type { Warning } from '../../model/dto'

export interface WarningsListProps {
  warnings: Warning[]
}

function warningContext(warning: Warning): string {
  const parts = [
    warning.dimension ? `dimension ${warning.dimension}` : null,
    warning.periodIndex != null ? `period ${warning.periodIndex}` : null,
    warning.tariffIndex != null ? `tariff ${warning.tariffIndex}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' / ') : 'global'
}

export function WarningsList({ warnings }: WarningsListProps) {
  if (warnings.length === 0) {
    return <p className="empty-state">No warnings</p>
  }

  return (
    <ul className="warnings-list">
      {warnings.map((warning, index) => (
        <li key={`${warning.code}-${index}`}>
          <strong>{warning.code}</strong>
          <span>{warning.message}</span>
          <small>
            {warning.kind} - {warningContext(warning)}
          </small>
        </li>
      ))}
    </ul>
  )
}
