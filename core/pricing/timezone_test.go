package pricing

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func mustLoad(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

func TestResolveZone(t *testing.T) {
	t.Run("explicit", func(t *testing.T) {
		loc, _, err := resolveZone(Input{}, Options{TimeZone: mustLoad("Asia/Tokyo")}, true)
		require.NoError(t, err)
		assert.Equal(t, "Asia/Tokyo", loc.String())
	})
	t.Run("strict errors", func(t *testing.T) {
		_, _, err := resolveZone(Input{}, Options{StrictTimeZone: true}, true)
		require.Error(t, err)
	})
	t.Run("country inference alpha-2", func(t *testing.T) {
		for _, tc := range []struct {
			country string
			zone    string
		}{
			{country: "NL", zone: "Europe/Amsterdam"},
			{country: "JP", zone: "Asia/Tokyo"},
			{country: "CZ", zone: "Europe/Prague"},
		} {
			t.Run(tc.country, func(t *testing.T) {
				loc, warns, err := resolveZone(Input{CountryCode: tc.country}, Options{}, true)
				require.NoError(t, err)
				assert.Equal(t, tc.zone, loc.String())
				require.NotEmpty(t, warns)
				assert.Equal(t, WarnTZInferred, warns[0].Code)
			})
		}
	})
	t.Run("multi timezone country falls back to utc", func(t *testing.T) {
		loc, warns, err := resolveZone(Input{CountryCode: "US"}, Options{}, true)
		require.NoError(t, err)
		assert.Equal(t, "UTC", loc.String())
		require.NotEmpty(t, warns)
		assert.Equal(t, WarnTZUTC, warns[0].Code)
	})
	t.Run("utc fallback", func(t *testing.T) {
		loc, warns, err := resolveZone(Input{}, Options{}, true)
		require.NoError(t, err)
		assert.Equal(t, "UTC", loc.String())
		assert.NotEmpty(t, warns)
	})
}
func TestCurrencyScale(t *testing.T) {
	assert.Equal(t, 0, currencyScale("JPY"))
	assert.Equal(t, 2, currencyScale("EUR"))
}
