import type { Money, Report } from '../../model/dto'
import { WarningsList } from './WarningsList'

const DIMENSIONS = ['ENERGY', 'TIME', 'PARKING_TIME', 'FLAT']

export interface CostBreakdownProps {
  report: Report
}

function afterTaxes(money: Money): string {
  return money.afterTaxes ?? 'n/a'
}

export function CostBreakdown({ report }: CostBreakdownProps) {
  const dimensions = DIMENSIONS.flatMap((dimension) => {
    const result = report.dimensions[dimension]
    return result ? [{ name: dimension, volume: result.volume, cost: result.cost }] : []
  })

  return (
    <section className="result-section" aria-labelledby="cost-breakdown-heading">
      <div className="section-heading">
        <h2 id="cost-breakdown-heading">Cost breakdown</h2>
        <span className="currency-badge">{report.currency}</span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">item</th>
            <th scope="col">volume</th>
            <th scope="col">before taxes</th>
            <th scope="col">after taxes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">total</th>
            <td>-</td>
            <td>{report.totalCost.beforeTaxes}</td>
            <td>{afterTaxes(report.totalCost)}</td>
          </tr>
          {dimensions.map((dimension) => (
            <tr key={dimension.name}>
              <th scope="row">{dimension.name}</th>
              <td>{dimension.volume}</td>
              <td>
                {dimension.cost.beforeTaxes}
                <span className="sr-only"> {dimension.name} before taxes</span>
              </td>
              <td>
                {afterTaxes(dimension.cost)}
                <span className="sr-only"> {dimension.name} after taxes</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <WarningsList warnings={report.warnings} />
    </section>
  )
}
