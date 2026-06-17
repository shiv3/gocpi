package v221_test

import (
	"testing"

	"github.com/shiv3/gocpi/v221"
	"github.com/stretchr/testify/require"
)

// TestJSONSchemaValidation exercises the embedded JSON-Schema validator against
// the generated OCPI types.
func TestJSONSchemaValidation(t *testing.T) {
	// Compiles the embedded schema.
	_, err := v221.Validator()
	require.NoError(t, err)

	// Missing required token/url/roles -> invalid.
	require.Error(t, v221.ValidateJSON("Credentials", []byte(`{}`)))

	// A complete, well-formed Credentials object -> valid.
	valid := `{
		"token": "abc",
		"url": "https://example.com/ocpi/versions",
		"roles": [{
			"role": "EMSP",
			"business_details": {"name": "Example"},
			"party_id": "EMS",
			"country_code": "DE"
		}]
	}`
	require.NoError(t, v221.ValidateJSON("Credentials", []byte(valid)))

	// country_code too long (len must be 2) -> invalid.
	badCountry := `{
		"token": "abc",
		"url": "https://example.com/ocpi/versions",
		"roles": [{
			"role": "EMSP",
			"business_details": {"name": "Example"},
			"party_id": "EMS",
			"country_code": "DEU"
		}]
	}`
	require.Error(t, v221.ValidateJSON("Credentials", []byte(badCountry)))
}
