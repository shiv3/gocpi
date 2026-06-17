package v230_test

import (
	"testing"

	"github.com/shiv3/gocpi/core"
	"github.com/shiv3/gocpi/v230"
	"github.com/stretchr/testify/require"
)

// TestV230SchemaAndValidation confirms the OCPI 2.3.0 package generated and
// validates, including the modules new in 2.3.0 (bookings, payments).
func TestV230SchemaAndValidation(t *testing.T) {
	v, err := v230.Validator()
	require.NoError(t, err)

	// Types new in 2.3.0 are present in the embedded JSON schema.
	require.Contains(t, v.Types(), "Booking")  // bookings module
	require.Contains(t, v.Types(), "Terminal") // payments module

	// JSON-Schema validation of a 2.3.0 type: missing required fields -> invalid.
	require.Error(t, v230.ValidateJSON("Booking", []byte(`{}`)))

	// Struct-tag validation of a 2.3.0 type.
	require.Error(t, core.Validate(v230.Booking{}))
}
