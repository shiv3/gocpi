package v221_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

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
		if _, err := os.Stat(filepath.Join(dir, "cdr.json")); err != nil {
			continue
		}
		if _, err := os.Stat(filepath.Join(dir, "tariff.json")); err != nil {
			continue
		}
		fixtures = append(fixtures, dir)
	}
	require.NotEmpty(t, fixtures)

	for _, dir := range fixtures {
		dir := dir
		t.Run(filepath.Base(filepath.Clean(dir)), func(t *testing.T) {
			cdrBytes, err := os.ReadFile(filepath.Join(dir, "cdr.json"))
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
			assert.Truef(t, got.Equal(expected), "expected excl_vat=%s computed excl_vat=%s", expected.String(), got.String())
		})
	}
}
