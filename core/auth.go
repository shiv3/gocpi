package core

import "context"

// Party identifies an OCPI party (a role of a platform), keyed by country code
// and party id.
type Party struct {
	CountryCode string
	PartyID     string
	Roles       []string
}

// TokenStore resolves an inbound credentials token to the owning Party. The
// server uses it to authenticate requests (OCPI 2.2.1 §4.1.2).
type TokenStore interface {
	Lookup(ctx context.Context, token string) (Party, bool, error)
}

// EncodeToken base64-encodes a credentials token for use in the Authorization
// header: "Token <base64>" (OCPI 2.2.1 §4.1.2).
//
// TODO(core, M1-A): implement.
func EncodeToken(credentialsToken string) string {
	panic("not implemented: core.EncodeToken")
}

// DecodeToken parses an "Authorization: Token <value>" header and returns the
// credentials token. It must tolerate non-base64 (2.1.1/2.2-era) tokens.
//
// TODO(core, M1-A): implement.
func DecodeToken(authHeader string) (string, error) {
	panic("not implemented: core.DecodeToken")
}
