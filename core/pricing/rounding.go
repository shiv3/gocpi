package pricing

import "github.com/shopspring/decimal"

const ocpiScale = 4

func roundOCPI(v decimal.Decimal) decimal.Decimal {
	return v.RoundBank(ocpiScale)
}

func roundCurrency(v decimal.Decimal, precision int) decimal.Decimal {
	return v.Round(int32(precision))
}

func stepBill(volume, step decimal.Decimal) (decimal.Decimal, error) {
	if step.LessThanOrEqual(decimal.Zero) {
		return decimal.Decimal{}, &PricingError{Code: InvalidInput, Msg: "step_size must be > 0"}
	}
	return volume.Div(step).Ceil().Mul(step), nil
}
