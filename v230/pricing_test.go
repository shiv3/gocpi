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

func ptrInt(i int) *int { return &i }

func TestUnknownDimensionWarns(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	cdr := v230.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v230.ChargingPeriod{{
			StartDateTime: start,
			Dimensions: []v230.CdrDimension{
				{Type: v230.CdrDimensionTypeEnergy, Volume: d("10")},
				{Type: v230.CdrDimensionType("CUSTOM_FOO"), Volume: d("1")},
			},
		}},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v230.Price{BeforeTaxes: d("3.00")},
		LastUpdated: start,
	}

	rep, err := v230.Calculate(cdr, v230EnergyTariff(d, start), pricing.Options{CurrencyPrecision: ptrInt(2)})

	require.NoError(t, err)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	assert.True(t, hasWarningCode(rep.Warnings, pricing.WarnUnknownDimension), "warnings: %#v", rep.Warnings)
}

func TestKnownUnpricedDimensionNoWarn(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	cdr := v230.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v230.ChargingPeriod{{
			StartDateTime: start,
			Dimensions: []v230.CdrDimension{
				{Type: v230.CdrDimensionTypeEnergy, Volume: d("10")},
				{Type: v230.CdrDimensionTypeEnergyImport, Volume: d("2")},
			},
		}},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v230.Price{BeforeTaxes: d("3.00")},
		LastUpdated: start,
	}

	rep, err := v230.Calculate(cdr, v230EnergyTariff(d, start), pricing.Options{CurrencyPrecision: ptrInt(2)})

	require.NoError(t, err)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "got %s", rep.TotalEnergyCost.BeforeTaxes)
	assert.False(t, hasWarningCode(rep.Warnings, pricing.WarnUnknownDimension), "warnings: %#v", rep.Warnings)
}

func TestCalculateTaxIncludedYes(t *testing.T) {
	d := decimal.RequireFromString
	utc := time.UTC
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, utc)
	vat := d("20")
	tariff := v230.Tariff{
		Currency:    "EUR",
		TaxIncluded: v230.TaxIncludedYes,
		Elements: []v230.TariffElement{{
			PriceComponents: []v230.PriceComponent{
				{Type: v230.TariffDimensionTypeEnergy, Price: d("0.36"), VAT: &vat, StepSize: 1},
			},
		}},
		LastUpdated: start,
	}
	cdr := v230.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v230.ChargingPeriod{{
			StartDateTime: start,
			Dimensions: []v230.CdrDimension{
				{Type: v230.CdrDimensionTypeEnergy, Volume: d("10")},
			},
		}},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v230.Price{BeforeTaxes: d("3.00")},
		LastUpdated: start,
	}

	rep, err := v230.Calculate(cdr, tariff, pricing.Options{CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "before-tax, got %s", rep.TotalEnergyCost.BeforeTaxes)
}

func TestFromCDRTaxIncludedNoKeepsPriceAndAttachesVAT(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	vat := d("20")
	price := d("0.36")
	tariff := v230TaxTariff(v230.TaxIncludedNo, price, &vat, start)

	in, err := v230.FromCDR(v230TaxCDR(d, start), tariff, pricing.Options{})

	require.NoError(t, err)
	require.Len(t, in.Tariffs, 1)
	assert.Equal(t, "tax-tariff", in.Tariffs[0].ID)
	require.Len(t, in.Tariffs[0].Elements, 1)
	require.Len(t, in.Tariffs[0].Elements[0].Components, 1)
	require.Len(t, in.Periods, 1)
	require.NotNil(t, in.Periods[0].TariffIndex)
	assert.Equal(t, 0, *in.Periods[0].TariffIndex)
	component := in.Tariffs[0].Elements[0].Components[0]
	assert.True(t, component.Price.Equal(price), "got %s", component.Price)
	require.Len(t, component.Taxes, 1)
	require.NotNil(t, component.Taxes[0].Percent)
	assert.True(t, component.Taxes[0].Percent.Equal(vat), "got %s", component.Taxes[0].Percent)
}

func TestFromCDRTaxIncludedNAKeepsPriceWithoutTaxes(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	vat := d("20")
	price := d("0.36")
	tariff := v230TaxTariff(v230.TaxIncludedNA, price, &vat, start)

	in, err := v230.FromCDR(v230TaxCDR(d, start), tariff, pricing.Options{})

	require.NoError(t, err)
	require.Len(t, in.Tariffs, 1)
	require.Len(t, in.Tariffs[0].Elements, 1)
	require.Len(t, in.Tariffs[0].Elements[0].Components, 1)
	require.Len(t, in.Periods, 1)
	require.NotNil(t, in.Periods[0].TariffIndex)
	assert.Equal(t, 0, *in.Periods[0].TariffIndex)
	component := in.Tariffs[0].Elements[0].Components[0]
	assert.True(t, component.Price.Equal(price), "got %s", component.Price)
	assert.Nil(t, component.Taxes)
}

func TestFromCDRBookingUnsupported(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	booking := v230.BookingRestrictionTypeBooking
	tariff := v230.Tariff{
		Currency:    "EUR",
		TaxIncluded: v230.TaxIncludedNo,
		Elements: []v230.TariffElement{{
			PriceComponents: []v230.PriceComponent{
				{Type: v230.TariffDimensionTypeEnergy, Price: d("0.30"), StepSize: 1},
			},
			Restrictions: &v230.TariffRestrictions{Booking: &booking},
		}},
		LastUpdated: start,
	}
	cdr := v230.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v230.ChargingPeriod{{
			StartDateTime: start,
			Dimensions: []v230.CdrDimension{
				{Type: v230.CdrDimensionTypeEnergy, Volume: d("10")},
			},
		}},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v230.Price{BeforeTaxes: d("3.00")},
		LastUpdated: start,
	}

	in, err := v230.FromCDR(cdr, tariff, pricing.Options{})
	require.NoError(t, err)
	require.Len(t, in.Tariffs, 1)
	require.Len(t, in.Periods, 1)
	require.NotNil(t, in.Periods[0].TariffIndex)
	assert.Equal(t, 0, *in.Periods[0].TariffIndex)
	require.Len(t, in.Tariffs[0].Elements, 1)
	assert.Contains(t, in.Tariffs[0].Elements[0].Restrictions.Unsupported, "booking")
}

func v230EnergyTariff(d func(string) decimal.Decimal, start time.Time) v230.Tariff {
	return v230.Tariff{
		ID:          "energy-tariff",
		Currency:    "EUR",
		TaxIncluded: v230.TaxIncludedNo,
		Elements: []v230.TariffElement{{
			PriceComponents: []v230.PriceComponent{
				{Type: v230.TariffDimensionTypeEnergy, Price: d("0.30"), StepSize: 1},
			},
		}},
		LastUpdated: start,
	}
}

func v230TaxTariff(taxIncluded v230.TaxIncluded, price decimal.Decimal, vat *decimal.Decimal, start time.Time) v230.Tariff {
	return v230.Tariff{
		ID:          "tax-tariff",
		Currency:    "EUR",
		TaxIncluded: taxIncluded,
		Elements: []v230.TariffElement{{
			PriceComponents: []v230.PriceComponent{
				{Type: v230.TariffDimensionTypeEnergy, Price: price, VAT: vat, StepSize: 1},
			},
		}},
		LastUpdated: start,
	}
}

func hasWarningCode(warnings []pricing.Warning, code pricing.WarningCode) bool {
	for _, warning := range warnings {
		if warning.Code == code {
			return true
		}
	}
	return false
}

func v230TaxCDR(d func(string) decimal.Decimal, start time.Time) v230.CDR {
	return v230.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v230.ChargingPeriod{{
			StartDateTime: start,
			Dimensions: []v230.CdrDimension{
				{Type: v230.CdrDimensionTypeEnergy, Volume: d("10")},
			},
		}},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v230.Price{BeforeTaxes: d("3.00")},
		LastUpdated: start,
	}
}
