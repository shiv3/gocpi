package pricing

import (
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMultiTariff_AllNoTariffZeroCost(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	tariffA := mtEnergyTariff("a", d("0.30"), 1)
	tariffA.MinPrice = &Money{BeforeTaxes: d("5.00")}
	in := mtInput(
		[]Tariff{tariffA, mtEnergyTariff("b", d("0.50"), 1)},
		[]Period{
			{Start: start, Energy: decimalPtr(d("0.5"))},
			{Start: start.Add(20 * time.Minute), Energy: decimalPtr(d("0.5"))},
		},
		start, start.Add(time.Hour),
	)

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)

	// No period has a tariff: zero cost, no clamp (min_price not applied), and a
	// WarnPeriodNoTariff per period.
	assert.True(t, rep.TotalCost.BeforeTaxes.IsZero(), "got %s", rep.TotalCost.BeforeTaxes)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.IsZero(), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	assert.True(t, rep.Dimensions[Energy].Volume.IsZero(), "got %s", rep.Dimensions[Energy].Volume)
	assert.False(t, hasWarn(rep.Warnings, WarnMinMaxUndefinedMultiTariff), "warnings: %#v", rep.Warnings)
	count := 0
	for _, w := range rep.Warnings {
		if w.Code == WarnPeriodNoTariff {
			count++
		}
	}
	assert.Equal(t, 2, count, "warnings: %#v", rep.Warnings)
}

func TestMultiTariff_ZeroVolumeFlatStillFires(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	tariff := Tariff{
		ID:       "a",
		Currency: "EUR",
		Elements: []Element{{
			Components: []PriceComponent{
				{Type: Flat, Price: d("1.00"), StepSize: 0},
				{Type: Energy, Price: d("0.30"), StepSize: 1},
			},
		}},
	}
	in := mtInput(
		[]Tariff{tariff},
		[]Period{{Start: start, Energy: decimalPtr(d("0")), TariffIndex: intPtr(0)}},
		start, start.Add(time.Hour),
	)

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)

	// Zero energy -> zero variable cost, but the FLAT fee still fires once.
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.IsZero(), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	assert.True(t, rep.TotalFixedCost.BeforeTaxes.Equal(d("1.00")), "got %s", rep.TotalFixedCost.BeforeTaxes)
}

func TestMultiTariff_UnusedTariffWarns(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	in := mtInput(
		[]Tariff{mtEnergyTariff("a", d("0.30"), 1), mtEnergyTariff("b", d("0.50"), 1)},
		[]Period{
			{Start: start, Energy: decimalPtr(d("0.5")), TariffIndex: intPtr(0)},
			{Start: start.Add(20 * time.Minute), Energy: decimalPtr(d("0.5")), TariffIndex: intPtr(0)},
		},
		start, start.Add(time.Hour),
	)

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)

	// Tariff B is unused; pricing is unaffected (1.0kWh * 0.30 = 0.30) but a
	// WarnUnusedTariff is emitted for tariff index 1.
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("0.30")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	require.True(t, hasWarn(rep.Warnings, WarnUnusedTariff), "warnings: %#v", rep.Warnings)
	for _, w := range rep.Warnings {
		if w.Code == WarnUnusedTariff {
			require.NotNil(t, w.TariffIndex)
			assert.Equal(t, 1, *w.TariffIndex)
		}
	}
}

func TestValidate_TariffIndexOutOfRange(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	in := mtInput(
		[]Tariff{mtEnergyTariff("a", d("0.30"), 1)},
		[]Period{{Start: start, Energy: decimalPtr(d("1.0")), TariffIndex: intPtr(5)}},
		start, start.Add(time.Hour),
	)

	_, err := Calculate(in, Options{TimeZone: time.UTC})
	var pe *PricingError
	require.True(t, errors.As(err, &pe))
	assert.Equal(t, InvalidInput, pe.Code)
}
