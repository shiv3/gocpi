package pricing

import "github.com/shopspring/decimal"

func sumTaxes(before decimal.Decimal, taxes []TaxAmount) (decimal.Decimal, bool) {
	if len(taxes) == 0 {
		return decimal.Zero, false
	}

	total := decimal.Zero
	for _, tax := range taxes {
		switch {
		case tax.Amount != nil:
			total = total.Add(*tax.Amount)
		case tax.Percent != nil:
			total = total.Add(before.Mul(*tax.Percent).Div(decimal.NewFromInt(100)))
		default:
			return decimal.Zero, false
		}
	}

	return total, true
}

func (m Money) afterTax() (decimal.Decimal, bool) {
	if m.AfterTaxes != nil {
		return *m.AfterTaxes, true
	}

	tax, ok := sumTaxes(m.BeforeTaxes, m.Taxes)
	if !ok {
		return decimal.Zero, false
	}

	return m.BeforeTaxes.Add(tax), true
}
