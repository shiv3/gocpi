package v221_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pricing "github.com/shiv3/gocpi/core/pricing"
	"github.com/shiv3/gocpi/v221"
)

// TestGoldenV221 prices real ocpi-tariffs reference fixtures and asserts the computed
// total matches each fixture's embedded total_cost (the reference-authoritative value).
func TestGoldenV221(t *testing.T) {
	dirs, err := filepath.Glob("testdata/v221/*")
	require.NoError(t, err)

	fixtures := make([]string, 0, len(dirs))
	for _, dir := range dirs {
		info, err := os.Stat(dir)
		if err != nil || !info.IsDir() {
			continue
		}
		if _, err := os.Stat(filepath.Join(dir, "tariff.json")); err != nil {
			continue
		}
		cdrs, err := filepath.Glob(filepath.Join(dir, "cdr*.json"))
		require.NoError(t, err)
		fixtures = append(fixtures, cdrs...)
	}
	require.NotEmpty(t, fixtures)

	for _, cdrPath := range fixtures {
		dir := filepath.Dir(cdrPath)
		testName := filepath.Base(filepath.Clean(dir)) + "/" + filepath.Base(cdrPath)
		t.Run(testName, func(t *testing.T) {
			cdrBytes, err := os.ReadFile(cdrPath)
			require.NoError(t, err)

			var cdr v221.CDR
			require.NoError(t, json.Unmarshal(cdrBytes, &cdr))

			tariffBytes, err := os.ReadFile(filepath.Join(dir, "tariff.json"))
			require.NoError(t, err)

			var tariff v221.Tariff
			require.NoError(t, json.Unmarshal(tariffBytes, &tariff))

			expected := cdr.TotalCost.ExclVAT

			rep, err := v221.Calculate(cdr, tariff, pricing.Options{})
			require.NoErrorf(t, err, "expected excl_vat=%s computed excl_vat=<not produced>", expected.String())

			got := rep.TotalCost.BeforeTaxes

			t.Logf("expected excl_vat=%s computed excl_vat=%s", expected.String(), got.String())
			assert.Equal(t, expected.StringFixed(4), got.StringFixed(4))

			if cdr.TotalCost.InclVAT == nil {
				return
			}

			expectedIncl := *cdr.TotalCost.InclVAT
			gotIncl, ok := computedAfterTax(rep.TotalCost)
			if ok {
				t.Logf("expected incl_vat=%s computed incl_vat=%s", expectedIncl.String(), gotIncl.String())
				assert.Equal(t, expectedIncl.StringFixed(4), gotIncl.StringFixed(4))
				return
			}

			if !expectedIncl.Equal(cdr.TotalCost.ExclVAT) {
				t.Fatalf("embedded incl_vat=%s differs from excl_vat=%s, but computed after-tax is not derivable", expectedIncl.String(), cdr.TotalCost.ExclVAT.String())
			}
			t.Logf("embedded incl_vat=%s equals excl_vat, computed after-tax is not derivable", expectedIncl.String())
		})
	}
}

func computedAfterTax(m pricing.Money) (decimal.Decimal, bool) {
	if m.AfterTaxes != nil {
		return *m.AfterTaxes, true
	}

	tax, ok := sumTaxes(m.BeforeTaxes, m.Taxes)
	if !ok {
		return decimal.Zero, false
	}
	return m.BeforeTaxes.Add(tax), true
}

func sumTaxes(before decimal.Decimal, taxes []pricing.TaxAmount) (decimal.Decimal, bool) {
	if len(taxes) == 0 {
		return decimal.Zero, false
	}

	total := decimal.Zero
	for _, tax := range taxes {
		switch {
		case tax.Amount != nil:
			total = total.Add(*tax.Amount)
		case tax.Percent != nil:
			total = total.Add(before.Mul(*tax.Percent).Div(decimal.NewFromInt(100)))
		default:
			return decimal.Zero, false
		}
	}

	return total, true
}
