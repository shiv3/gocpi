package pricing

import "github.com/shopspring/decimal"

func decimalPtr(value decimal.Decimal) *decimal.Decimal {
	copied := value
	return &copied
}
