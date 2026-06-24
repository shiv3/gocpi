package pricing

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
)

func decPtr(v decimal.Decimal) *decimal.Decimal {
	return &v
}

func TestMoneyAfterTax(t *testing.T) {
	d := decimal.RequireFromString

	cases := map[string]struct {
		money Money
		want  decimal.Decimal
		ok    bool
	}{
		"explicit after taxes wins": {
			money: Money{
				BeforeTaxes: d("10"),
				AfterTaxes:  decPtr(d("12")),
			},
			want: d("12"),
			ok:   true,
		},
		"percent tax": {
			money: Money{
				BeforeTaxes: d("10"),
				Taxes: []TaxAmount{
					{Percent: decPtr(d("20"))},
				},
			},
			want: d("12"),
			ok:   true,
		},
		"absolute amount": {
			money: Money{
				BeforeTaxes: d("10"),
				Taxes: []TaxAmount{
					{Amount: decPtr(d("1.5"))},
				},
			},
			want: d("11.5"),
			ok:   true,
		},
		"no taxes": {
			money: Money{
				BeforeTaxes: d("10"),
			},
			ok: false,
		},
	}

	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			got, ok := c.money.afterTax()
			assert.Equal(t, c.ok, ok)
			if c.ok {
				assert.True(t, got.Equal(c.want), "got %s, want %s", got, c.want)
			}
		})
	}
}
