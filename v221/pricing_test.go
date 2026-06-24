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

func ptrInt(i int) *int { return &i }

func v221Tariff(d func(string) decimal.Decimal, start time.Time) v221.Tariff {
	return v221.Tariff{
		ID:       "tariff-1",
		Currency: "EUR",
		Elements: []v221.TariffElement{{
			PriceComponents: []v221.PriceComponent{
				{Type: "ENERGY", Price: d("0.30"), StepSize: 1},
			},
		}},
		LastUpdated: start,
	}
}

func TestCalculateEndToEnd(t *testing.T) {
	d := decimal.RequireFromString
	utc := time.UTC
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, utc)
	cdr := v221.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v221.ChargingPeriod{{
			StartDateTime: start,
			Dimensions: []v221.CdrDimension{
				{Type: "ENERGY", Volume: d("10")},
			},
		}},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v221.Price{ExclVAT: d("3.00")},
		LastUpdated: start,
	}

	rep, err := v221.Calculate(cdr, v221Tariff(d, start), pricing.Options{CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
}

func TestUnknownDimensionWarns(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	cdr := v221.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v221.ChargingPeriod{{
			StartDateTime: start,
			Dimensions: []v221.CdrDimension{
				{Type: v221.CdrDimensionTypeEnergy, Volume: d("10")},
				{Type: v221.CdrDimensionType("CUSTOM_FOO"), Volume: d("1")},
			},
		}},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v221.Price{ExclVAT: d("3.00")},
		LastUpdated: start,
	}

	rep, err := v221.Calculate(cdr, v221Tariff(d, start), pricing.Options{CurrencyPrecision: ptrInt(2)})

	require.NoError(t, err)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	assert.True(t, hasWarningCode(rep.Warnings, pricing.WarnUnknownDimension), "warnings: %#v", rep.Warnings)
}

func TestKnownUnpricedDimensionNoWarn(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	cdr := v221.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v221.ChargingPeriod{{
			StartDateTime: start,
			Dimensions: []v221.CdrDimension{
				{Type: v221.CdrDimensionTypeEnergy, Volume: d("10")},
				{Type: v221.CdrDimensionTypeStateOfCharge, Volume: d("50")},
			},
		}},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v221.Price{ExclVAT: d("3.00")},
		LastUpdated: start,
	}

	rep, err := v221.Calculate(cdr, v221Tariff(d, start), pricing.Options{CurrencyPrecision: ptrInt(2)})

	require.NoError(t, err)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	assert.False(t, hasWarningCode(rep.Warnings, pricing.WarnUnknownDimension), "warnings: %#v", rep.Warnings)
}

func TestFromCDREmbeddedTotalsMapped(t *testing.T) {
	d := decimal.RequireFromString
	utc := time.UTC
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, utc)
	cdr := v221.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v221.ChargingPeriod{{
			StartDateTime: start,
			Dimensions: []v221.CdrDimension{
				{Type: "ENERGY", Volume: d("10")},
			},
		}},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v221.Price{ExclVAT: d("3.00")},
		LastUpdated: start,
	}

	in, err := v221.FromCDR(cdr, v221Tariff(d, start), pricing.Options{})
	require.NoError(t, err)
	require.Len(t, in.Tariffs, 1)
	assert.Equal(t, "tariff-1", in.Tariffs[0].ID)
	require.Len(t, in.Periods, 1)
	require.NotNil(t, in.Periods[0].TariffIndex)
	assert.Equal(t, 0, *in.Periods[0].TariffIndex)
	require.NotNil(t, in.Embedded.TotalCost)
	assert.True(t, in.Embedded.TotalCost.BeforeTaxes.Equal(d("3.00")))
	require.NotNil(t, in.Embedded.TotalEnergy)
	assert.True(t, in.Embedded.TotalEnergy.Equal(d("10")))
}

func TestFromCDRRejectsMultiTariff(t *testing.T) {
	d := decimal.RequireFromString
	utc := time.UTC
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, utc)
	a, b := "tariff-a", "tariff-b"
	cdr := v221.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v221.ChargingPeriod{
			{StartDateTime: start, TariffID: &a, Dimensions: []v221.CdrDimension{{Type: "ENERGY", Volume: d("5")}}},
			{StartDateTime: start.Add(30 * time.Minute), TariffID: &b, Dimensions: []v221.CdrDimension{{Type: "ENERGY", Volume: d("5")}}},
		},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v221.Price{ExclVAT: d("3")},
		LastUpdated: start,
	}

	_, err := v221.FromCDR(cdr, v221Tariff(d, start), pricing.Options{})
	var pe *pricing.PricingError
	require.ErrorAs(t, err, &pe)
	assert.Equal(t, pricing.InvalidInput, pe.Code)
}

func TestFromCDRRejectsDuplicateDimensionsInChargingPeriod(t *testing.T) {
	d := decimal.RequireFromString
	utc := time.UTC
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, utc)
	cdr := v221.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v221.ChargingPeriod{{
			StartDateTime: start,
			Dimensions: []v221.CdrDimension{
				{Type: v221.CdrDimensionTypeEnergy, Volume: d("5")},
				{Type: v221.CdrDimensionTypeEnergy, Volume: d("5")},
			},
		}},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v221.Price{ExclVAT: d("3")},
		LastUpdated: start,
	}

	_, err := v221.FromCDR(cdr, v221Tariff(d, start), pricing.Options{})

	var pe *pricing.PricingError
	require.ErrorAs(t, err, &pe)
	assert.Equal(t, pricing.InvalidInput, pe.Code)
	assert.Equal(t, "duplicate dimension ENERGY in charging period", pe.Msg)
}

func TestReservationElementExcludedFromNormalSession(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	reservation := v221.ReservationRestrictionTypeReservation
	tariff := v221.Tariff{
		Currency: "EUR",
		Elements: []v221.TariffElement{
			{
				Restrictions: &v221.TariffRestrictions{Reservation: &reservation},
				PriceComponents: []v221.PriceComponent{
					{Type: v221.TariffDimensionTypeEnergy, Price: d("99.00"), StepSize: 1},
				},
			},
			{
				PriceComponents: []v221.PriceComponent{
					{Type: v221.TariffDimensionTypeEnergy, Price: d("0.30"), StepSize: 1},
				},
			},
		},
		LastUpdated: start,
	}
	cdr := v221.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v221.ChargingPeriod{{
			StartDateTime: start,
			Dimensions: []v221.CdrDimension{
				{Type: v221.CdrDimensionTypeEnergy, Volume: d("10")},
			},
		}},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v221.Price{ExclVAT: d("3.00")},
		LastUpdated: start,
	}

	rep, err := v221.Calculate(cdr, tariff, pricing.Options{CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
}

func hasWarningCode(warnings []pricing.Warning, code pricing.WarningCode) bool {
	for _, warning := range warnings {
		if warning.Code == code {
			return true
		}
	}
	return false
}
