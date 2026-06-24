package pricing

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shiv3/gocpi/v221"
)

func v221Tariff(d func(string) decimal.Decimal, start time.Time) v221.Tariff {
	return v221.Tariff{
		Currency: "EUR",
		Elements: []v221.TariffElement{{
			PriceComponents: []v221.PriceComponent{
				{Type: "ENERGY", Price: d("0.30"), StepSize: 1},
			},
		}},
		LastUpdated: start,
	}
}

func TestCalculateV221EndToEnd(t *testing.T) {
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

	rep, err := CalculateV221(cdr, v221Tariff(d, start), Options{CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
}

func TestFromV221EmbeddedTotalsMapped(t *testing.T) {
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

	in, err := FromV221(cdr, v221Tariff(d, start), Options{})
	require.NoError(t, err)
	require.NotNil(t, in.Embedded.TotalCost)
	assert.True(t, in.Embedded.TotalCost.BeforeTaxes.Equal(d("3.00")))
	require.NotNil(t, in.Embedded.TotalEnergy)
	assert.True(t, in.Embedded.TotalEnergy.Equal(d("10")))
}

func TestFromV221RejectsMultiTariff(t *testing.T) {
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

	_, err := FromV221(cdr, v221Tariff(d, start), Options{})
	var pe *PricingError
	require.ErrorAs(t, err, &pe)
	assert.Equal(t, InvalidInput, pe.Code)
}

func TestFromV221RejectsDuplicateDimensionsInChargingPeriod(t *testing.T) {
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

	_, err := FromV221(cdr, v221Tariff(d, start), Options{})

	var pe *PricingError
	require.ErrorAs(t, err, &pe)
	assert.Equal(t, InvalidInput, pe.Code)
	assert.Equal(t, "duplicate dimension ENERGY in charging period", pe.Msg)
}
