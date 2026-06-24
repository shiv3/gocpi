package pricing

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shiv3/gocpi/v230"
)

func TestCalculateV230TaxIncludedYes(t *testing.T) {
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

	rep, err := CalculateV230(cdr, tariff, Options{CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "before-tax, got %s", rep.TotalEnergyCost.BeforeTaxes)
}

func TestFromV230TaxIncludedNoKeepsPriceAndAttachesVAT(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	vat := d("20")
	price := d("0.36")
	tariff := v230TaxTariff(v230.TaxIncludedNo, price, &vat, start)

	in, err := FromV230(v230TaxCDR(d, start), tariff, Options{})

	require.NoError(t, err)
	require.Len(t, in.Tariff.Elements, 1)
	require.Len(t, in.Tariff.Elements[0].Components, 1)
	component := in.Tariff.Elements[0].Components[0]
	assert.True(t, component.Price.Equal(price), "got %s", component.Price)
	require.Len(t, component.Taxes, 1)
	require.NotNil(t, component.Taxes[0].Percent)
	assert.True(t, component.Taxes[0].Percent.Equal(vat), "got %s", component.Taxes[0].Percent)
}

func TestFromV230TaxIncludedNAKeepsPriceWithoutTaxes(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	vat := d("20")
	price := d("0.36")
	tariff := v230TaxTariff(v230.TaxIncludedNA, price, &vat, start)

	in, err := FromV230(v230TaxCDR(d, start), tariff, Options{})

	require.NoError(t, err)
	require.Len(t, in.Tariff.Elements, 1)
	require.Len(t, in.Tariff.Elements[0].Components, 1)
	component := in.Tariff.Elements[0].Components[0]
	assert.True(t, component.Price.Equal(price), "got %s", component.Price)
	assert.Nil(t, component.Taxes)
}

func TestFromV230BookingUnsupported(t *testing.T) {
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

	in, err := FromV230(cdr, tariff, Options{})
	require.NoError(t, err)
	require.Len(t, in.Tariff.Elements, 1)
	assert.Contains(t, in.Tariff.Elements[0].Restrictions.Unsupported, "booking")
}

func v230TaxTariff(taxIncluded v230.TaxIncluded, price decimal.Decimal, vat *decimal.Decimal, start time.Time) v230.Tariff {
	return v230.Tariff{
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
