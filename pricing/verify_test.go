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
	assert.Len(t, v.Mismatches, 0)
	assert.Len(t, v.Warnings, 0)

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

func TestVerifyAfterTaxComputedNotDerivable_OK(t *testing.T) {
	d := decimal.RequireFromString

	embedded := EmbeddedTotals{TotalCost: &Money{BeforeTaxes: d("3.00")}}
	rep := Report{TotalCost: Money{BeforeTaxes: d("3.00")}}

	v := Verify(Input{Embedded: embedded}, rep, Options{})
	assert.Equal(t, StatusOK, v.Status)
}

func TestVerifyAfterTaxEmbeddedNotDerivable_NotVerifiable(t *testing.T) {
	d := decimal.RequireFromString
	dp := func(s string) *decimal.Decimal { v := d(s); return &v }

	embedded := EmbeddedTotals{TotalCost: &Money{BeforeTaxes: d("3.00")}}
	rep := Report{TotalCost: Money{BeforeTaxes: d("3.00"), Taxes: []TaxAmount{{Percent: dp("20")}}}}

	v := Verify(Input{Embedded: embedded}, rep, Options{})
	assert.Equal(t, StatusNotVerifiable, v.Status)
	assert.Len(t, v.Mismatches, 0)
}

func TestVerifyVolumeAuditMismatch(t *testing.T) {
	d := decimal.RequireFromString
	dp := func(s string) *decimal.Decimal { v := d(s); return &v }

	in := Input{
		Periods: []Period{{Energy: dp("10")}},
		Embedded: EmbeddedTotals{
			TotalEnergy: dp("12"),
		},
	}
	rep := Report{}

	v := Verify(in, rep, Options{})
	assert.Equal(t, StatusMismatch, v.Status)

	foundTotalEnergy := false
	for _, mismatch := range v.Mismatches {
		if mismatch.Field != "total_energy" {
			continue
		}

		foundTotalEnergy = true
		assert.True(t, d("-2").Equal(mismatch.Delta), "delta = %s", mismatch.Delta)
	}
	assert.True(t, foundTotalEnergy, "expected total_energy mismatch")
}
