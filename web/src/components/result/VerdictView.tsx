import type { Verdict } from '../../model/dto'
import { WarningsList } from './WarningsList'

export interface VerdictViewProps {
  verdict: Verdict
}

export function VerdictView({ verdict }: VerdictViewProps) {
  return (
    <section className="result-section" aria-labelledby="verdict-heading">
      <div className="section-heading">
        <h2 id="verdict-heading">Verify verdict</h2>
        <span className={`status-badge status-badge--${verdict.status.toLowerCase()}`}>{verdict.status}</span>
      </div>
      {verdict.mismatches.length === 0 ? (
        <p className="empty-state">No mismatches</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">field</th>
              <th scope="col">computed</th>
              <th scope="col">embedded</th>
              <th scope="col">delta</th>
            </tr>
          </thead>
          <tbody>
            {verdict.mismatches.map((mismatch) => (
              <tr key={mismatch.field}>
                <th scope="row">{mismatch.field}</th>
                <td>{mismatch.computed}</td>
                <td>{mismatch.embedded}</td>
                <td>{mismatch.delta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <WarningsList warnings={verdict.warnings} />
    </section>
  )
}
