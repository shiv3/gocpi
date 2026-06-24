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
		loc, warns, err := resolveZone(Input{CountryCode: "NL"}, Options{}, true)
		require.NoError(t, err)
		assert.Equal(t, "Europe/Amsterdam", loc.String())
		assert.NotEmpty(t, warns)
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
