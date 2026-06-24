package pricing

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMatches(t *testing.T) {
	d := decimal.RequireFromString
	dp := func(s string) *decimal.Decimal { v := d(s); return &v }
	sp := func(s string) *string { return &s }
	utc := time.UTC
	at := time.Date(2026, 6, 24, 9, 30, 0, 0, utc) // Wed 09:30
	start := snapshot{at: at, loc: utc, energy: d("3"), durSession: time.Hour}
	p := Period{MinPower: dp("3"), MaxPower: dp("7"), MinCurrent: dp("10"), MaxCurrent: dp("16")}

	check := func(r *Restrictions, want bool) func(*testing.T) {
		return func(t *testing.T) {
			ok, _ := matches(r, start, p)
			assert.Equal(t, want, ok)
		}
	}

	t.Run("nil", check(nil, true))
	t.Run("start_time incl", check(&Restrictions{StartTime: sp("09:30")}, true))
	t.Run("end_time excl", check(&Restrictions{EndTime: sp("09:30")}, false))
	t.Run("min_kwh incl", check(&Restrictions{MinKwh: dp("3")}, true))
	t.Run("max_kwh excl", check(&Restrictions{MaxKwh: dp("3")}, false))
	t.Run("min_duration uses session duration", check(&Restrictions{MinDuration: durationPtr(2 * time.Hour)}, false))
	t.Run("min_power on period max", check(&Restrictions{MinPower: dp("7")}, true))
	t.Run("min_power above period max", check(&Restrictions{MinPower: dp("8")}, false))
	t.Run("max_power on period min", check(&Restrictions{MaxPower: dp("7")}, true))
	t.Run("max_power excl on period min", check(&Restrictions{MaxPower: dp("3")}, false))
	t.Run("min_current on period max", check(&Restrictions{MinCurrent: dp("16")}, true))
	t.Run("max_current excl on period min", check(&Restrictions{MaxCurrent: dp("10")}, false))
	t.Run("same-day end_date excludes that day", check(&Restrictions{EndDate: sp("2026-06-24")}, false))
	t.Run("end_date next day includes", check(&Restrictions{EndDate: sp("2026-06-25")}, true))
	t.Run("unsupported", func(t *testing.T) {
		ok, uns := matches(&Restrictions{Unsupported: []string{"booking"}}, start, p)
		assert.False(t, ok)
		assert.True(t, uns)
	})
}

func TestValidateRestrictionStrings(t *testing.T) {
	sp := func(s string) *string { return &s }

	require.Error(t, validateRestrictionStrings(&Restrictions{StartTime: sp("25:00")}))
	require.Error(t, validateRestrictionStrings(&Restrictions{StartDate: sp("2026-13-01")}))
	require.NoError(t, validateRestrictionStrings(&Restrictions{StartTime: sp("09:30"), EndDate: sp("2026-06-25")}))
}

func durationPtr(v time.Duration) *time.Duration {
	return &v
}
