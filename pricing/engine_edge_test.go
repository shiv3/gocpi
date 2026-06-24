package pricing

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shiv3/gocpi/v221"
)

func TestMatchesWrappingTimeWindow(t *testing.T) {
	sp := func(s string) *string { return &s }
	utc := time.UTC
	restrictions := &Restrictions{StartTime: sp("22:00"), EndTime: sp("06:00")}

	for _, tc := range []struct {
		name string
		at   time.Time
		want bool
	}{
		{name: "late evening", at: time.Date(2026, 6, 24, 23, 0, 0, 0, utc), want: true},
		{name: "early morning", at: time.Date(2026, 6, 25, 5, 0, 0, 0, utc), want: true},
		{name: "midday", at: time.Date(2026, 6, 24, 12, 0, 0, 0, utc), want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ok, unsupported := matches(restrictions, newSnapshot(tc.at, utc), Period{})

			assert.Equal(t, tc.want, ok)
			assert.False(t, unsupported)
		})
	}
}

func TestMatchesMinPowerWithAbsentPeriodMaxPower(t *testing.T) {
	d := decimal.RequireFromString
	dp := func(s string) *decimal.Decimal { v := d(s); return &v }
	start := newSnapshot(time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC), time.UTC)

	ok, unsupported := matches(&Restrictions{MinPower: dp("8")}, start, Period{})

	assert.True(t, ok)
	assert.False(t, unsupported)
}

func TestReservationElementExcludedFromNormalSession(t *testing.T) {
	d := decimal.RequireFromString
	utc := time.UTC
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, utc)
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

	rep, err := CalculateV221(cdr, tariff, Options{CurrencyPrecision: ptrInt(2)})
	require.NoError(t, err)
	assert.True(t, rep.TotalEnergyCost.BeforeTaxes.Equal(d("3.00")), "got %s", rep.TotalEnergyCost.BeforeTaxes)

	rt := ReservationTypeReservation
	ok, unsupported := matches(&Restrictions{Reservation: &rt}, newSnapshot(start, utc), Period{Energy: decimalPtr(d("10"))})
	assert.False(t, ok)
	assert.False(t, unsupported)
}

func TestCalculateWarnsWhenSessionStartsBeforeTariffWindow(t *testing.T) {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	tariffStart := start.Add(time.Hour)
	in := Input{
		Version:  V221,
		Currency: "EUR",
		Start:    start,
		End:      start.Add(time.Hour),
		Tariff: Tariff{
			Currency:      "EUR",
			StartDateTime: &tariffStart,
			Elements: []Element{{
				Components: []PriceComponent{{Type: Energy, Price: d("0.30"), StepSize: 1}},
			}},
		},
		Periods: []Period{{Start: start, Energy: decimalPtr(d("1"))}},
	}

	rep, err := Calculate(in, Options{TimeZone: time.UTC})

	require.NoError(t, err)
	require.Len(t, rep.Warnings, 1)
	assert.Equal(t, WarnTariffWindow, rep.Warnings[0].Code)
}
