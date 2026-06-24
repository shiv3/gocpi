package v221_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pricing "github.com/shiv3/gocpi/core/pricing"
	"github.com/shiv3/gocpi/v221"
)

func requireInvalidInput(t *testing.T, err error) {
	t.Helper()
	var pe *pricing.PricingError
	require.ErrorAs(t, err, &pe)
	assert.Equal(t, pricing.InvalidInput, pe.Code)
}

// energyTariff builds a single-element ENERGY tariff with the given id and price.
func energyTariff(id string, price decimal.Decimal, start time.Time) v221.Tariff {
	return v221.Tariff{
		ID:       id,
		Currency: "EUR",
		Elements: []v221.TariffElement{{
			PriceComponents: []v221.PriceComponent{
				{Type: "ENERGY", Price: price, StepSize: 1},
			},
		}},
		LastUpdated: start,
	}
}

func energyPeriod(start time.Time, tariffID *string, kwh decimal.Decimal) v221.ChargingPeriod {
	return v221.ChargingPeriod{
		StartDateTime: start,
		TariffID:      tariffID,
		Dimensions:    []v221.CdrDimension{{Type: "ENERGY", Volume: kwh}},
	}
}

func TestCalculateCDR_SingleEmbeddedTariff(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	id := "a"
	base := func(periods []v221.ChargingPeriod) v221.CDR {
		return v221.CDR{
			CountryCode:     "NL",
			Currency:        "EUR",
			StartDateTime:   start,
			EndDateTime:     start.Add(time.Hour),
			Tariffs:         []v221.Tariff{energyTariff(id, d("0.30"), start)},
			ChargingPeriods: periods,
			TotalEnergy:     d("10"),
			TotalTime:       d("1"),
			TotalCost:       v221.Price{ExclVAT: d("3.00")},
			LastUpdated:     start,
		}
	}

	t.Run("omitted tariff_id applies the single tariff", func(t *testing.T) {
		rep, err := v221.CalculateCDR(base([]v221.ChargingPeriod{energyPeriod(start, nil, d("10"))}), pricing.Options{CurrencyPrecision: ptrInt(2)})
		require.NoError(t, err)
		assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	})

	t.Run("matching tariff_id applies", func(t *testing.T) {
		rep, err := v221.CalculateCDR(base([]v221.ChargingPeriod{energyPeriod(start, &id, d("10"))}), pricing.Options{CurrencyPrecision: ptrInt(2)})
		require.NoError(t, err)
		assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	})

	t.Run("non-matching tariff_id is rejected", func(t *testing.T) {
		other := "zzz"
		_, err := v221.CalculateCDR(base([]v221.ChargingPeriod{energyPeriod(start, &other, d("10"))}), pricing.Options{})
		requireInvalidInput(t, err)
	})
}

func TestCalculateCDR_MultiTariffResolution(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	a, b := "a", "b"
	cdr := v221.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		Tariffs: []v221.Tariff{
			energyTariff(a, d("0.30"), start),
			energyTariff(b, d("0.50"), start),
		},
		ChargingPeriods: []v221.ChargingPeriod{
			energyPeriod(start, &a, d("10")),
			energyPeriod(start.Add(30*time.Minute), &b, d("10")),
		},
		TotalEnergy: d("20"),
		TotalTime:   d("1"),
		TotalCost:   v221.Price{ExclVAT: d("8.00")},
		LastUpdated: start,
	}

	rep, err := v221.CalculateCDR(cdr, pricing.Options{CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)
	// 10kWh*0.30 + 10kWh*0.50 = 3.00 + 5.00 = 8.00 (each period priced at its tariff).
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("8.00")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	assert.True(t, rep.TotalCost.BeforeTaxes.Equal(d("8.00")), "got %s", rep.TotalCost.BeforeTaxes)
}

func TestCalculateCDR_NilTariffIDMulti(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	a, b := "a", "b"
	cdr := v221.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		Tariffs: []v221.Tariff{
			energyTariff(a, d("0.30"), start),
			energyTariff(b, d("0.50"), start),
		},
		ChargingPeriods: []v221.ChargingPeriod{
			energyPeriod(start, &a, d("10")),
			energyPeriod(start.Add(30*time.Minute), nil, d("10")),
		},
		TotalEnergy: d("20"),
		TotalTime:   d("1"),
		TotalCost:   v221.Price{ExclVAT: d("3.00")},
		LastUpdated: start,
	}

	rep, err := v221.CalculateCDR(cdr, pricing.Options{CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)
	// Only the first period is priced (10*0.30=3.00); the nil-tariff period is zero-cost.
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	assert.True(t, hasWarningCode(rep.Warnings, pricing.WarnPeriodNoTariff), "warnings: %#v", rep.Warnings)
}

func TestCalculateCDR_UnknownTariffID(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	a, ghost := "a", "ghost"
	cdr := v221.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		Tariffs: []v221.Tariff{
			energyTariff(a, d("0.30"), start),
			energyTariff("b", d("0.50"), start),
		},
		ChargingPeriods: []v221.ChargingPeriod{energyPeriod(start, &ghost, d("10"))},
		TotalEnergy:     d("10"),
		TotalCost:       v221.Price{ExclVAT: d("3")},
		LastUpdated:     start,
	}

	_, err := v221.CalculateCDR(cdr, pricing.Options{})
	requireInvalidInput(t, err)
}

func TestCalculateCDR_EmptyTariffs(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	cdr := v221.CDR{
		CountryCode:     "NL",
		Currency:        "EUR",
		StartDateTime:   start,
		EndDateTime:     start.Add(time.Hour),
		ChargingPeriods: []v221.ChargingPeriod{energyPeriod(start, nil, d("10"))},
		TotalCost:       v221.Price{ExclVAT: d("3")},
		LastUpdated:     start,
	}

	_, err := v221.CalculateCDR(cdr, pricing.Options{})
	requireInvalidInput(t, err)
}

func TestVerifyCDR_SingleEmbeddedTariff(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	id := "a"
	energyCost := v221.Price{ExclVAT: d("3.00")}
	cdr := v221.CDR{
		CountryCode:     "NL",
		Currency:        "EUR",
		StartDateTime:   start,
		EndDateTime:     start.Add(time.Hour),
		Tariffs:         []v221.Tariff{energyTariff(id, d("0.30"), start)},
		ChargingPeriods: []v221.ChargingPeriod{energyPeriod(start, &id, d("10"))},
		TotalEnergy:     d("10"),
		TotalCost:       v221.Price{ExclVAT: d("3.00")},
		TotalEnergyCost: &energyCost,
		LastUpdated:     start,
	}

	v, err := v221.VerifyCDR(cdr, pricing.Options{CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)
	assert.Equal(t, pricing.StatusOK, v.Status, "verdict: %#v", v)
}
