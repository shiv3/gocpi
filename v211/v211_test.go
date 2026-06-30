package v211_test

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/shiv3/gocpi/core"
	"github.com/shiv3/gocpi/v211"
	"github.com/stretchr/testify/require"
)

var (
	_ = v211.NewTokensSenderClient
	_ = (*v211.TokensSenderClient).PostAuthorize
	_ = (*v211.TokensSenderClient).GetTokens
	_ = v211.NewCommandsSenderClient
	_ = (*v211.CommandsSenderClient).PostCommandResult
	_ = v211.NewCommandsReceiverClient
	_ = (*v211.CommandsReceiverClient).PostReserveNow
	_ = v211.NewLocationsReceiverClient
	_ = (*v211.LocationsReceiverClient).PatchLocation
	_ = v211.NewTariffsReceiverClient
	_ = (*v211.TariffsReceiverClient).DeleteTariff
	_ = v211.RegisterCPO
	_ = v211.RegisterMSP
	_ = v211.CPOHandlers{}
	_ = v211.MSPHandlers{}
)

// TestV211SchemaAndValidation confirms the OCPI 2.1.1 package generated and
// validates, including its module inventory and 2.1.1-specific omissions.
func TestV211SchemaAndValidation(t *testing.T) {
	v, err := v211.Validator()
	require.NoError(t, err)

	for _, typeName := range []string{
		"CDR",
		"Session",
		"Tariff",
		"Token",
		"AuthorizationInfo",
		"CommandResponse",
		"Credentials",
		"Version",
		"Location",
	} {
		require.Contains(t, v.Types(), typeName)
	}
	require.NotContains(t, v.Types(), "ChargingProfile")
	require.NotContains(t, v.Types(), "DateTime")

	var cdr v211.CDR
	require.Equal(t, reflect.TypeOf(time.Time{}), reflect.TypeOf(cdr.StartDateTime))
	require.Equal(t, reflect.TypeOf(time.Time{}), reflect.TypeOf(cdr.LastUpdated))

	require.Error(t, v211.ValidateJSON("CDR", []byte(`{}`)))
	require.Error(t, core.Validate(v211.CDR{}))
}

func TestV211IdentityAndTokenValidation(t *testing.T) {
	credentials := validCredentials()
	require.NoError(t, core.Validate(credentials))

	invalidCountry := credentials
	invalidCountry.CountryCode = "N"
	requireValidationError(t, core.Validate(invalidCountry), "CountryCode", "len")

	invalidParty := credentials
	invalidParty.PartyID = "XYZW"
	requireValidationError(t, core.Validate(invalidParty), "PartyID", "len")

	emptyToken := credentials
	emptyToken.Token = ""
	requireValidationError(t, core.Validate(emptyToken), "Token", "required")

	longToken := credentials
	longToken.Token = strings.Repeat("a", 65)
	requireValidationError(t, core.Validate(longToken), "Token", "max")

	requireValidationError(t, core.Validate(v211.CDR{CountryCode: "N"}), "CountryCode", "len")
	requireValidationError(t, core.Validate(v211.Location{CountryCode: "N"}), "CountryCode", "len")
	requireValidationError(t, core.Validate(v211.Token{CountryCode: "N"}), "CountryCode", "len")
}

func validCredentials() v211.Credentials {
	return v211.Credentials{
		Token: "abc",
		URL:   "https://example.com/ocpi/versions",
		BusinessDetails: v211.BusinessDetails{
			Name: "Example",
		},
		PartyID:     "EMS",
		CountryCode: "DE",
	}
}

func requireValidationError(t *testing.T, err error, field string, tag string) {
	t.Helper()

	var validationErrors validator.ValidationErrors
	require.ErrorAs(t, err, &validationErrors)
	for _, validationError := range validationErrors {
		if validationError.Field() == field && validationError.Tag() == tag {
			return
		}
	}

	require.Failf(t, "missing validation error", "expected %s to fail %s, got %v", field, tag, err)
}
