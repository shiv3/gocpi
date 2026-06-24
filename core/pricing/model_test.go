package pricing

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseDimensionType(t *testing.T) {
	cases := map[string]struct {
		in   string
		want DimensionType
		ok   bool
	}{
		"energy":  {"ENERGY", Energy, true},
		"time":    {"TIME", Time, true},
		"parking": {"PARKING_TIME", ParkingTime, true},
		"flat":    {"FLAT", Flat, true},
		"unknown": {"BOGUS", 0, false},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			got, ok := ParseDimensionType(c.in)
			assert.Equal(t, c.ok, ok)
			if c.ok {
				assert.Equal(t, c.want, got)
				assert.Equal(t, c.in, got.String())
			}
		})
	}
}

func TestPricingErrorImplementsError(t *testing.T) {
	var err error = &PricingError{Code: InvalidInput, Msg: "boom"}
	assert.Contains(t, err.Error(), "boom")
}
