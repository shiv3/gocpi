package pricing

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
)

func TestVerifyMatchAndMismatch(t *testing.T) {
	d := decimal.RequireFromString
	dp := func(s string) *decimal.Decimal { v := d(s); return &v }
	mp := func(s string) *Money { return &Money{BeforeTaxes: d(s)} }

	in := Input{
		Embedded: EmbeddedTotals{
			TotalCost:       mp("6.00"),
			TotalEnergyCost: mp("3.00"),
			TotalEnergy:     dp("10"),
			TotalTime:       dp("1"),
		},
		Periods: []Period{{Energy: dp("10"), Time: dp("1")}},
	}
	rep := Report{
		TotalCost:       Money{BeforeTaxes: d("6.00")},
		TotalEnergyCost: Money{BeforeTaxes: d("3.00")},
	}

	v := Verify(in, rep, Options{})
	assert.Equal(t, StatusOK, v.Status)

	in.Embedded.TotalCost = mp("7.00")
	v = Verify(in, rep, Options{})
	assert.Equal(t, StatusMismatch, v.Status)
	assert.NotEmpty(t, v.Mismatches)
}

func TestVerifyReservationNotVerifiable(t *testing.T) {
	d := decimal.RequireFromString

	in := Input{
		Embedded: EmbeddedTotals{
			TotalReservationCost: &Money{BeforeTaxes: d("2.00")},
		},
	}
	rep := Report{}

	v := Verify(in, rep, Options{})
	assert.Equal(t, StatusNotVerifiable, v.Status)
}

func TestVerifyAfterTaxDerivable(t *testing.T) {
	d := decimal.RequireFromString
	dp := func(s string) *decimal.Decimal { v := d(s); return &v }
	emb := &Money{BeforeTaxes: d("3.00"), Taxes: []TaxAmount{{Percent: dp("20")}}}
	in := Input{Embedded: EmbeddedTotals{TotalCost: emb}}
	rep := Report{TotalCost: Money{BeforeTaxes: d("3.00"), Taxes: []TaxAmount{{Percent: dp("20")}}}}
	v := Verify(in, rep, Options{})
	assert.Equal(t, StatusOK, v.Status)
}
