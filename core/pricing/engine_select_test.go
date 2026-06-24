package pricing

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestActiveComponentsPerDimension(t *testing.T) {
	d := decimal.RequireFromString
	sp := func(s string) *string { return &s }
	dp := func(s string) *decimal.Decimal {
		v := d(s)
		return &v
	}

	tariff := Tariff{
		Elements: []Element{
			{
				Restrictions: &Restrictions{
					StartTime: sp("06:00"),
					EndTime:   sp("22:00"),
				},
				Components: []PriceComponent{
					{Type: Energy, Price: d("0.30"), StepSize: 1},
				},
			},
			{
				Components: []PriceComponent{
					{Type: Energy, Price: d("0.50"), StepSize: 1},
					{Type: Time, Price: d("2.00"), StepSize: 1},
				},
			},
		},
	}
	start := newSnapshot(time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC), time.UTC)
	p := Period{MaxPower: dp("7")}

	cs, warns := activeComponents([]Tariff{tariff}, 0, start, p)

	require.Empty(t, warns)
	require.NotNil(t, cs.energy)
	assert.True(t, cs.energy.comp.Price.Equal(d("0.30")), "got %s, want 0.30", cs.energy.comp.Price)
	assert.Equal(t, 0, cs.energy.tariffIndex)
	assert.Equal(t, 0, cs.energy.elementIndex)
	require.NotNil(t, cs.time)
	assert.True(t, cs.time.comp.Price.Equal(d("2.00")), "got %s, want 2.00", cs.time.comp.Price)
	assert.Equal(t, 0, cs.time.tariffIndex)
	assert.Equal(t, 1, cs.time.elementIndex)
}
