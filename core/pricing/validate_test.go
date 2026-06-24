package pricing

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateInputRejectsInvalidVolumeStepSize(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name string
		dim  DimensionType
		step int
	}{
		{name: "energy negative", dim: Energy, step: -1},
		{name: "time negative", dim: Time, step: -1},
		{name: "parking zero", dim: ParkingTime, step: 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			in := validValidationInput(start, d)
			in.Tariffs[0].Elements[0].Components[0].Type = tc.dim
			in.Tariffs[0].Elements[0].Components[0].StepSize = tc.step

			err := ValidateInput(in)

			var pe *PricingError
			require.ErrorAs(t, err, &pe)
			assert.Equal(t, InvalidInput, pe.Code)
		})
	}
}

func TestValidateInputAcceptsEnergyZeroStepSize(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	in := validValidationInput(start, d)
	in.Tariffs[0].Elements[0].Components[0] = PriceComponent{Type: Energy, Price: d("0.30"), StepSize: 0}

	require.NoError(t, ValidateInput(in))
}

func TestValidateInputAcceptsFlatZeroStepSize(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	in := validValidationInput(start, d)
	in.Tariffs[0].Elements[0].Components[0] = PriceComponent{Type: Flat, Price: d("1.00"), StepSize: 0}

	require.NoError(t, ValidateInput(in))
}

func TestValidateInputRejectsNegativePeriodEnergy(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	in := validValidationInput(start, d)
	in.Periods[0].Energy = decimalPtr(d("-0.1"))

	err := ValidateInput(in)

	var pe *PricingError
	require.ErrorAs(t, err, &pe)
	assert.Equal(t, InvalidInput, pe.Code)
}

func TestValidateInputRejectsTariffIndexOutOfRange(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	in := validValidationInput(start, d)
	in.Periods[0].TariffIndex = intPtr(1)

	err := ValidateInput(in)

	var pe *PricingError
	require.ErrorAs(t, err, &pe)
	assert.Equal(t, InvalidInput, pe.Code)
}

func TestCalculateSortsUnsortedPeriods(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	sorted := validValidationInput(start, d)
	sorted.Periods = []Period{
		{Start: start, Energy: decimalPtr(d("0.5")), TariffIndex: intPtr(0)},
		{Start: start.Add(30 * time.Minute), Energy: decimalPtr(d("0.5")), TariffIndex: intPtr(0)},
	}
	unsorted := sorted
	unsorted.Periods = []Period{
		{Start: start.Add(30 * time.Minute), Energy: decimalPtr(d("0.5")), TariffIndex: intPtr(0)},
		{Start: start, Energy: decimalPtr(d("0.5")), TariffIndex: intPtr(0)},
	}
	firstStart := unsorted.Periods[0].Start

	sortedReport, err := Calculate(sorted, Options{TimeZone: time.UTC})
	require.NoError(t, err)
	unsortedReport, err := Calculate(unsorted, Options{TimeZone: time.UTC})
	require.NoError(t, err)

	assert.Equal(t, firstStart, unsorted.Periods[0].Start, "Calculate must not mutate caller periods")
	assert.True(t, unsortedReport.TotalCost.BeforeTaxes.Equal(sortedReport.TotalCost.BeforeTaxes))
	assert.True(t, unsortedReport.Dimensions[Energy].Volume.Equal(sortedReport.Dimensions[Energy].Volume))
}

func TestCalculateWarnsOnPeriodOutsideBounds(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name        string
		periodStart time.Time
	}{
		{name: "before start", periodStart: start.Add(-time.Second)},
		{name: "after end", periodStart: start.Add(time.Hour + time.Second)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			in := validValidationInput(start, d)
			in.Periods[0].Start = tc.periodStart

			require.NoError(t, ValidateInput(in))
			rep, err := Calculate(in, Options{TimeZone: time.UTC})

			require.NoError(t, err)
			assert.True(t, rep.TotalCost.BeforeTaxes.Equal(d("0.30")), "out-of-bounds period should still be priced, got %s", rep.TotalCost.BeforeTaxes)
			require.Len(t, rep.Warnings, 1)
			assert.Equal(t, WarnPeriodOutsideBounds, rep.Warnings[0].Code)
			assert.Equal(t, KindWarning, rep.Warnings[0].Kind)
			assert.Equal(t, "charging period start is outside CDR bounds", rep.Warnings[0].Msg)
		})
	}
}

func validValidationInput(start time.Time, d func(string) decimal.Decimal) Input {
	return Input{
		Version:  V221,
		Currency: "EUR",
		Start:    start,
		End:      start.Add(time.Hour),
		Tariffs: []Tariff{{
			Currency: "EUR",
			Elements: []Element{{
				Components: []PriceComponent{{Type: Energy, Price: d("0.30"), StepSize: 1}},
			}},
		}},
		Periods: []Period{{Start: start, Energy: decimalPtr(d("1")), TariffIndex: intPtr(0)}},
	}
}
