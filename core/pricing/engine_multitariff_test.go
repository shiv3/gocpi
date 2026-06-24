package pricing

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mtEnergyTariff builds a single-element ENERGY tariff with the given id, price
// and step (in Wh).
func mtEnergyTariff(id string, price decimal.Decimal, step int) Tariff {
	return Tariff{
		ID:       id,
		Currency: "EUR",
		Elements: []Element{{
			Components: []PriceComponent{{Type: Energy, Price: price, StepSize: step}},
		}},
	}
}

func mtInput(tariffs []Tariff, periods []Period, start, end time.Time) Input {
	return Input{
		Version:  V221,
		Currency: "EUR",
		Start:    start,
		End:      end,
		Tariffs:  tariffs,
		Periods:  periods,
	}
}

func hasWarn(warnings []Warning, code WarningCode) bool {
	for _, w := range warnings {
		if w.Code == code {
			return true
		}
	}
	return false
}

func TestMultiTariff_SessionWideStep(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	in := mtInput(
		[]Tariff{mtEnergyTariff("a", d("0.30"), 1000), mtEnergyTariff("b", d("0.50"), 1000)},
		[]Period{
			{Start: start, Energy: decimalPtr(d("0.4")), TariffIndex: intPtr(0)},
			{Start: start.Add(20 * time.Minute), Energy: decimalPtr(d("0.4")), TariffIndex: intPtr(1)},
		},
		start, start.Add(time.Hour),
	)

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)

	// session 0.8kWh rounds up ONCE to 1.0kWh (step 1000Wh on last tariff B); the
	// 0.2kWh delta is priced at B (0.50): 0.4*0.30 + 0.6*0.50 = 0.12 + 0.30 = 0.42.
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("0.42")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	assert.True(t, rep.Dimensions[Energy].Volume.Equal(d("0.8")), "got %s", rep.Dimensions[Energy].Volume)
	assert.False(t, hasWarn(rep.Warnings, WarnMixedStepSize), "warnings: %#v", rep.Warnings)
	assert.False(t, hasWarn(rep.Warnings, WarnMinMaxUndefinedMultiTariff), "warnings: %#v", rep.Warnings)
}

func TestMultiTariff_MixedStepWarns(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	in := mtInput(
		[]Tariff{mtEnergyTariff("a", d("0.30"), 1000), mtEnergyTariff("b", d("0.50"), 500)},
		[]Period{
			{Start: start, Energy: decimalPtr(d("0.4")), TariffIndex: intPtr(0)},
			{Start: start.Add(20 * time.Minute), Energy: decimalPtr(d("0.4")), TariffIndex: intPtr(1)},
		},
		start, start.Add(time.Hour),
	)

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)

	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("0.42")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	require.True(t, hasWarn(rep.Warnings, WarnMixedStepSize), "warnings: %#v", rep.Warnings)
	for _, w := range rep.Warnings {
		if w.Code == WarnMixedStepSize {
			assert.Equal(t, Energy, w.Dimension)
		}
	}
}

func TestMultiTariff_IdleStepSuppressionAcrossTariffs(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	tariffA := Tariff{
		ID:       "a",
		Currency: "EUR",
		Elements: []Element{{
			Components: []PriceComponent{
				{Type: Time, Price: d("1.00"), StepSize: 3600},
				{Type: ParkingTime, Price: d("2.00"), StepSize: 60},
			},
		}},
	}
	tariffB := Tariff{
		ID:       "b",
		Currency: "EUR",
		Elements: []Element{{
			Components: []PriceComponent{{Type: Time, Price: d("1.00"), StepSize: 3600}},
		}},
	}
	in := mtInput(
		[]Tariff{tariffA, tariffB},
		[]Period{
			{Start: start, Time: decimalPtr(d("0.5")), ParkingTime: decimalPtr(d("0.1")), TariffIndex: intPtr(0)},
			{Start: start.Add(30 * time.Minute), Time: decimalPtr(d("0.4")), TariffIndex: intPtr(1)},
		},
		start, start.Add(time.Hour),
	)

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)

	// The parking step under tariff A suppresses the TIME step under tariff B, so
	// TIME is billed without rounding: 0.5*1.00 + 0.4*1.00 = 0.90 (not 1.00).
	assert.True(t, rep.TotalTimeCost.BeforeTaxes.Equal(d("0.90")), "got %s", rep.TotalTimeCost.BeforeTaxes)
}

func TestMultiTariff_ABA_LastPeriodStep(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	in := mtInput(
		[]Tariff{mtEnergyTariff("a", d("0.30"), 1000), mtEnergyTariff("b", d("0.50"), 1000)},
		[]Period{
			{Start: start, Energy: decimalPtr(d("0.3")), TariffIndex: intPtr(0)},
			{Start: start.Add(20 * time.Minute), Energy: decimalPtr(d("0.3")), TariffIndex: intPtr(1)},
			{Start: start.Add(40 * time.Minute), Energy: decimalPtr(d("0.3")), TariffIndex: intPtr(0)},
		},
		start, start.Add(time.Hour),
	)

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)

	// session 0.9kWh rounds up to 1.0kWh; the 0.1kWh delta is priced at the LAST
	// period's tariff A (0.30): 0.3*0.30 + 0.3*0.50 + 0.4*0.30 = 0.09+0.15+0.12 = 0.36.
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("0.36")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
}

func TestMultiTariff_NoTariffMiddleInclusiveSnapshot(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	minKwh := d("0.5")
	tariffA := Tariff{
		ID:       "a",
		Currency: "EUR",
		Elements: []Element{
			{
				Restrictions: &Restrictions{MinKwh: &minKwh},
				Components:   []PriceComponent{{Type: Energy, Price: d("0.50"), StepSize: 1}},
			},
			{
				Components: []PriceComponent{{Type: Energy, Price: d("0.30"), StepSize: 1}},
			},
		},
	}
	in := mtInput(
		[]Tariff{tariffA},
		[]Period{
			{Start: start, Energy: decimalPtr(d("0.4")), TariffIndex: intPtr(0)},
			{Start: start.Add(20 * time.Minute), Energy: decimalPtr(d("0.3"))}, // no tariff
			{Start: start.Add(40 * time.Minute), Energy: decimalPtr(d("0.4")), TariffIndex: intPtr(0)},
		},
		start, start.Add(time.Hour),
	)

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)

	// Cost/step ledger excludes the no-tariff period: priced volume = 0.8kWh.
	assert.True(t, rep.Dimensions[Energy].Volume.Equal(d("0.8")), "got %s", rep.Dimensions[Energy].Volume)
	// The running snapshot INCLUDES the no-tariff 0.3kWh, so period 3 sees cumulative
	// 0.7kWh >= min_kwh 0.5 and matches the 0.50 element: 0.4*0.30 + 0.4*0.50 = 0.32.
	// (Were the snapshot exclusive, period 3 would fall back to 0.30 -> 0.24.)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("0.32")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	assert.True(t, hasWarn(rep.Warnings, WarnPeriodNoTariff), "warnings: %#v", rep.Warnings)
}

func TestMultiTariff_FlatPerElement(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	tariffA := Tariff{
		ID:       "a",
		Currency: "EUR",
		Elements: []Element{{
			Components: []PriceComponent{
				{Type: Flat, Price: d("1.00"), StepSize: 0},
				{Type: Energy, Price: d("0.30"), StepSize: 1},
			},
		}},
	}
	tariffB := Tariff{
		ID:       "b",
		Currency: "EUR",
		Elements: []Element{{
			Components: []PriceComponent{
				{Type: Flat, Price: d("2.00"), StepSize: 0},
				{Type: Energy, Price: d("0.50"), StepSize: 1},
			},
		}},
	}
	in := mtInput(
		[]Tariff{tariffA, tariffB},
		[]Period{
			{Start: start, Energy: decimalPtr(d("1.0")), TariffIndex: intPtr(0)},
			{Start: start.Add(30 * time.Minute), Energy: decimalPtr(d("1.0")), TariffIndex: intPtr(1)},
		},
		start, start.Add(time.Hour),
	)

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)

	// Each tariff's FLAT element is charged once: 1.00 + 2.00 = 3.00.
	assert.True(t, rep.TotalFixedCost.BeforeTaxes.Equal(d("3.00")), "got %s", rep.TotalFixedCost.BeforeTaxes)
}

func TestMultiTariff_MinMaxNotApplied(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	tariffA := mtEnergyTariff("a", d("0.30"), 1)
	tariffA.MinPrice = &Money{BeforeTaxes: d("5.00")}
	in := mtInput(
		[]Tariff{tariffA, mtEnergyTariff("b", d("0.50"), 1)},
		[]Period{
			{Start: start, Energy: decimalPtr(d("1.0")), TariffIndex: intPtr(0)},
			{Start: start.Add(30 * time.Minute), Energy: decimalPtr(d("1.0")), TariffIndex: intPtr(1)},
		},
		start, start.Add(time.Hour),
	)

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)

	// Two tariffs priced the session, so tariff A's min_price 5.00 is NOT applied;
	// total stays the unclamped 1.0*0.30 + 1.0*0.50 = 0.80.
	assert.True(t, rep.TotalCost.BeforeTaxes.Equal(d("0.80")), "got %s", rep.TotalCost.BeforeTaxes)
	assert.True(t, hasWarn(rep.Warnings, WarnMinMaxUndefinedMultiTariff), "warnings: %#v", rep.Warnings)
}

func TestMultiTariff_MinMaxVerifyNotVerifiable(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	tariffA := mtEnergyTariff("a", d("0.30"), 1)
	tariffA.MinPrice = &Money{BeforeTaxes: d("5.00")}
	in := mtInput(
		[]Tariff{tariffA, mtEnergyTariff("b", d("0.50"), 1)},
		[]Period{
			{Start: start, Energy: decimalPtr(d("1.0")), TariffIndex: intPtr(0)},
			{Start: start.Add(30 * time.Minute), Energy: decimalPtr(d("1.0")), TariffIndex: intPtr(1)},
		},
		start, start.Add(time.Hour),
	)
	// The CDR reports the min-clamped total; we cannot verify it for a multi-tariff session.
	in.Embedded.TotalCost = &Money{BeforeTaxes: d("5.00")}

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)
	v := Verify(in, rep, Options{})

	assert.Equal(t, StatusNotVerifiable, v.Status, "verdict: %#v", v)
	assert.Empty(t, v.Mismatches, "total_cost must not be a mismatch when min/max is undefined: %#v", v.Mismatches)
}
