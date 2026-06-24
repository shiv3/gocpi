package pricing

import (
	"errors"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRoundOCPI_ReferenceCases(t *testing.T) {
	d := decimal.RequireFromString
	cases := [][2]string{
		{"13.951148", "13.9511"},
		{"13.951158", "13.9512"},
	}
	for _, c := range cases {
		assert.True(t, roundOCPI(d(c[0])).Equal(d(c[1])), "%s -> %s got %s", c[0], c[1], roundOCPI(d(c[0])))
	}
}

func TestStepBill(t *testing.T) {
	d := decimal.RequireFromString
	got, err := stepBill(d("2500"), d("1000"))
	require.NoError(t, err)
	assert.True(t, got.Equal(d("3000")))

	got, err = stepBill(d("3600"), d("1800"))
	require.NoError(t, err)
	assert.True(t, got.Equal(d("3600")))

	_, err = stepBill(d("100"), d("0"))
	require.Error(t, err)
	var pricingErr *PricingError
	require.True(t, errors.As(err, &pricingErr))
	assert.Equal(t, InvalidInput, pricingErr.Code)
}

func TestRoundCurrency(t *testing.T) {
	d := decimal.RequireFromString
	assert.True(t, roundCurrency(d("123.4"), 0).Equal(d("123")))
	assert.True(t, roundCurrency(d("123.5"), 0).Equal(d("124")))
}
