package v221_test

import (
	"testing"

	"github.com/shiv3/gocpi/core"
	"github.com/shiv3/gocpi/v221"
	"github.com/stretchr/testify/require"
)

// TestValidateGeneratedTypes exercises core.Validate against the generated
// `validate` struct tags on a representative OCPI type.
func TestValidateGeneratedTypes(t *testing.T) {
	// Missing required fields (language, text) -> error.
	require.Error(t, core.Validate(v221.DisplayText{}))

	// Fully valid -> no error.
	require.NoError(t, core.Validate(v221.DisplayText{Language: "en", Text: "Hello"}))

	// language must be exactly 2 characters (len=2) -> error.
	require.Error(t, core.Validate(v221.DisplayText{Language: "eng", Text: "Hello"}))
}
