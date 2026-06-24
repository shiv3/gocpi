package v230_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pricing "github.com/shiv3/gocpi/core/pricing"
	"github.com/shiv3/gocpi/v230"
)

func TestCalculateCDR_DuplicateTariffID(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	dup := "dup"
	cdr := v230.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		Tariffs: []v230.Tariff{
			energyTariff(dup, d("0.30"), start),
			energyTariff(dup, d("0.50"), start),
		},
		ChargingPeriods: []v230.ChargingPeriod{energyPeriod(start, &dup, d("10"))},
		TotalEnergy:     d("10"),
		TotalCost:       v230.Price{BeforeTaxes: d("3")},
		LastUpdated:     start,
	}

	_, err := v230.CalculateCDR(cdr, pricing.Options{})
	requireInvalidInput(t, err)
}

func TestCalculateCDR_EmptyIDMultiTariff(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	a := "a"
	cdr := v230.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		Tariffs: []v230.Tariff{
			energyTariff("", d("0.30"), start),
			energyTariff(a, d("0.50"), start),
		},
		ChargingPeriods: []v230.ChargingPeriod{energyPeriod(start, &a, d("10"))},
		TotalEnergy:     d("10"),
		TotalCost:       v230.Price{BeforeTaxes: d("5")},
		LastUpdated:     start,
	}

	_, err := v230.CalculateCDR(cdr, pricing.Options{})
	requireInvalidInput(t, err)
}

func TestCalculateCDR_MultiCurrency(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	a, b := "a", "b"
	usd := energyTariff(b, d("0.50"), start)
	usd.Currency = "USD"
	cdr := v230.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		Tariffs: []v230.Tariff{
			energyTariff(a, d("0.30"), start),
			usd,
		},
		ChargingPeriods: []v230.ChargingPeriod{
			energyPeriod(start, &a, d("10")),
			energyPeriod(start.Add(30*time.Minute), &b, d("10")),
		},
		TotalEnergy: d("20"),
		TotalCost:   v230.Price{BeforeTaxes: d("8")},
		LastUpdated: start,
	}

	_, err := v230.CalculateCDR(cdr, pricing.Options{})
	requireInvalidInput(t, err)
}

func TestVerifyCDR_VolumeAuditIncludesNoTariffPeriod(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	a, b := "a", "b"
	energyCost := v230.Price{BeforeTaxes: d("3.00")}
	cdr := v230.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		Tariffs: []v230.Tariff{
			energyTariff(a, d("0.30"), start),
			energyTariff(b, d("0.50"), start),
		},
		ChargingPeriods: []v230.ChargingPeriod{
			energyPeriod(start, &a, d("10")),
			energyPeriod(start.Add(30*time.Minute), nil, d("5")), // no tariff: excluded from cost, included in audit
		},
		TotalEnergy:     d("15"), // includes the no-tariff period's 5kWh
		TotalCost:       v230.Price{BeforeTaxes: d("3.00")},
		TotalEnergyCost: &energyCost,
		LastUpdated:     start,
	}

	v, err := v230.VerifyCDR(cdr, pricing.Options{CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)

	// total_energy audit sums all periods (15kWh incl. the no-tariff 5kWh), so the
	// embedded total matches and there is no mismatch.
	assert.Equal(t, pricing.StatusOK, v.Status, "verdict: %#v", v)
	assert.True(t, hasWarningCode(v.Warnings, pricing.WarnPeriodNoTariff), "warnings: %#v", v.Warnings)
}
