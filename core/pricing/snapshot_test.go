package pricing

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
)

func TestSnapshotStartUsedForRestrictions(t *testing.T) {
	d := decimal.RequireFromString
	_ = d
	utc := time.UTC
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, utc)
	s0 := newSnapshot(start, utc)
	assert.True(t, s0.energy.Equal(decimal.Zero))
	assert.Equal(t, time.Duration(0), s0.durSession)
	assert.Equal(t, 9, s0.localTime().Hour()) // start snapshot is the matching instant
}

func TestSnapshotNextAdvances(t *testing.T) {
	d := decimal.RequireFromString
	hp := func(s string) *decimal.Decimal { v := d(s); return &v }
	utc := time.UTC
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, utc)
	s1 := newSnapshot(start, utc).next(Period{Start: start, Energy: hp("5"), Time: hp("0.5")}, start.Add(time.Hour))
	assert.True(t, s1.energy.Equal(d("5")))
	assert.Equal(t, time.Hour, s1.durSession)
	assert.Equal(t, 30*time.Minute, s1.durCharging)
	assert.Equal(t, 10, s1.localTime().Hour()) // advanced to end
}
