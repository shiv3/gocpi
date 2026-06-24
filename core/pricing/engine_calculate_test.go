package pricing

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func ptrInt(i int) *int { return &i }

func TestCalculate(t *testing.T) {
	d := decimal.RequireFromString
	dp := func(s string) *decimal.Decimal { v := d(s); return &v }
	utc := time.UTC
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, utc)

	baseTariff := func() Tariff {
		return Tariff{Currency: "EUR", Elements: []Element{{Components: []PriceComponent{
			{Type: Flat, Price: d("1.00"), StepSize: 1},
			{Type: Energy, Price: d("0.30"), StepSize: 1},
			{Type: Time, Price: d("2.00"), StepSize: 1},
		}}}}
	}
	mkIn := func(tf Tariff, periods []Period, end time.Time) Input {
		for i := range periods {
			if periods[i].TariffIndex == nil {
				periods[i].TariffIndex = intPtr(0)
			}
		}
		return Input{Version: V221, Currency: "EUR", Start: start, End: end, Tariffs: []Tariff{tf}, Periods: periods}
	}

	t.Run("energy_time_flat_total", func(t *testing.T) {
		in := mkIn(baseTariff(), []Period{{Start: start, Energy: dp("10"), Time: dp("1.0"), MaxPower: dp("11")}}, start.Add(time.Hour))
		rep, err := Calculate(in, Options{CurrencyPrecision: ptrInt(2)})
		require.NoError(t, err)
		assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")))
		assert.True(t, rep.TotalTimeCost.BeforeTaxes.Equal(d("2.00")))
		assert.True(t, rep.TotalFixedCost.BeforeTaxes.Equal(d("1.00")))
		assert.True(t, rep.TotalCost.BeforeTaxes.Equal(d("6.00")))
	})

	t.Run("flat_once_across_periods", func(t *testing.T) {
		in := mkIn(baseTariff(), []Period{
			{Start: start, Energy: dp("5"), Time: dp("0.5"), MaxPower: dp("11")},
			{Start: start.Add(30 * time.Minute), Energy: dp("5"), Time: dp("0.5"), MaxPower: dp("11")},
		}, start.Add(time.Hour))
		rep, err := Calculate(in, Options{CurrencyPrecision: ptrInt(2)})
		require.NoError(t, err)
		assert.True(t, rep.TotalFixedCost.BeforeTaxes.Equal(d("1.00")), "flat once, got %s", rep.TotalFixedCost.BeforeTaxes)
	})

	t.Run("step_pooled_across_session", func(t *testing.T) {
		// ENERGY step 1000 Wh; two periods 0.4kWh + 0.4kWh = 0.8kWh -> pooled 800Wh -> ceil to 1000Wh
		tf := Tariff{Currency: "EUR", Elements: []Element{{Components: []PriceComponent{{Type: Energy, Price: d("0.30"), StepSize: 1000}}}}}
		in := mkIn(tf, []Period{
			{Start: start, Energy: dp("0.4"), MaxPower: dp("11")},
			{Start: start.Add(30 * time.Minute), Energy: dp("0.4"), MaxPower: dp("11")},
		}, start.Add(time.Hour))
		rep, err := Calculate(in, Options{CurrencyPrecision: ptrInt(2)})
		require.NoError(t, err)
		assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("0.30")), "1kWh billed, got %s", rep.TotalEnergyCost.BeforeTaxes)
	})

	t.Run("min_max_price_clamp", func(t *testing.T) {
		tf := baseTariff()
		tf.MinPrice = &Money{BeforeTaxes: d("10.00"), AfterTaxes: dp("11.00")}
		in := mkIn(tf, []Period{{Start: start, Energy: dp("1"), Time: dp("0.1"), MaxPower: dp("11")}}, start.Add(6*time.Minute))
		rep, err := Calculate(in, Options{CurrencyPrecision: ptrInt(2)})
		require.NoError(t, err)
		assert.True(t, rep.TotalCost.BeforeTaxes.Equal(d("10.00")), "clamped to min, got %s", rep.TotalCost.BeforeTaxes)
		require.NotNil(t, rep.TotalCost.AfterTaxes)
		assert.True(t, rep.TotalCost.AfterTaxes.Equal(d("11.00")), "clamped to min after taxes, got %s", rep.TotalCost.AfterTaxes)
	})

	t.Run("missing_dimension_zero", func(t *testing.T) {
		// no ENERGY dimension in period -> energy cost 0, warning
		in := mkIn(baseTariff(), []Period{{Start: start, Time: dp("1.0"), MaxPower: dp("11")}}, start.Add(time.Hour))
		rep, err := Calculate(in, Options{CurrencyPrecision: ptrInt(2)})
		require.NoError(t, err)
		assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("0")))
	})

	t.Run("tax_rollup_before_after", func(t *testing.T) {
		tf := Tariff{Currency: "EUR", Elements: []Element{{Components: []PriceComponent{
			{Type: Energy, Price: d("0.30"), StepSize: 1, Taxes: []TaxAmount{{Percent: dp("20")}}},
		}}}}
		in := mkIn(tf, []Period{{Start: start, Energy: dp("10"), MaxPower: dp("11")}}, start.Add(time.Hour))
		rep, err := Calculate(in, Options{CurrencyPrecision: ptrInt(2)})
		require.NoError(t, err)
		assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")))
		after, ok := rep.TotalEnergyCost.afterTax()
		require.True(t, ok)
		assert.True(t, after.Equal(d("3.60")), "20%% VAT, got %s", after)
	})

	t.Run("tariff_window_warns", func(t *testing.T) {
		tf := baseTariff()
		win := start.Add(48 * time.Hour)
		tf.StartDateTime = &win // session starts before tariff valid
		in := mkIn(tf, []Period{{Start: start, Energy: dp("1"), MaxPower: dp("11")}}, start.Add(time.Hour))
		rep, err := Calculate(in, Options{CurrencyPrecision: ptrInt(2)})
		require.NoError(t, err)
		assert.NotEmpty(t, rep.Warnings)
	})
}

func TestCalculateAppliesTimeStepWhenParkingComponentMatchesButNoParkingConsumed(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	in := Input{
		Version:  V221,
		Currency: "EUR",
		Start:    start,
		End:      start.Add(30 * time.Minute),
		Tariffs: []Tariff{{
			Currency: "EUR",
			Elements: []Element{{
				Components: []PriceComponent{
					{Type: Time, Price: d("10.00"), StepSize: 3600},
					{Type: ParkingTime, Price: d("1.00"), StepSize: 3600},
				},
			}},
		}},
		Periods: []Period{{
			Start:       start,
			Time:        decimalPtr(d("0.5")),
			TariffIndex: intPtr(0),
		}},
	}

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})

	require.NoError(t, err)
	assert.True(t, rep.TotalTimeCost.BeforeTaxes.Equal(d("10.00")), "time step should apply without consumed parking, got %s", rep.TotalTimeCost.BeforeTaxes)
}

func TestCalculateNoTariffPeriodSkipsPricingButAdvancesSnapshot(t *testing.T) {
	d := decimal.RequireFromString
	dp := func(s string) *decimal.Decimal { v := d(s); return &v }
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	minKwh := d("0.7")
	in := Input{
		Version:  V221,
		Currency: "EUR",
		Start:    start,
		End:      start.Add(time.Hour),
		Tariffs: []Tariff{{
			Currency: "EUR",
			Elements: []Element{
				{
					Restrictions: &Restrictions{MinKwh: &minKwh},
					Components:   []PriceComponent{{Type: Energy, Price: d("1.00"), StepSize: 1}},
				},
				{
					Components: []PriceComponent{{Type: Energy, Price: d("0.10"), StepSize: 1}},
				},
			},
		}},
		Periods: []Period{
			{Start: start, Energy: dp("0.4"), TariffIndex: intPtr(0)},
			{Start: start.Add(20 * time.Minute), Energy: dp("0.3")},
			{Start: start.Add(40 * time.Minute), Energy: dp("0.4"), TariffIndex: intPtr(0)},
		},
	}

	rep, err := Calculate(in, Options{TimeZone: time.UTC, CurrencyPrecision: ptrInt(2)})

	require.NoError(t, err)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("0.44")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	assert.True(t, rep.Dimensions[Energy].Volume.Equal(d("0.8")), "got %s", rep.Dimensions[Energy].Volume)
	require.Len(t, rep.Warnings, 1)
	assert.Equal(t, WarnPeriodNoTariff, rep.Warnings[0].Code)
	require.NotNil(t, rep.Warnings[0].PeriodIndex)
	assert.Equal(t, 1, *rep.Warnings[0].PeriodIndex)
}
