package core

import (
	"context"
	"encoding/base64"
	"errors"
	"strings"
)

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
func EncodeToken(credentialsToken string) string {
	return base64.StdEncoding.EncodeToString([]byte(credentialsToken))
}

// DecodeToken parses an "Authorization: Token <value>" header and returns the
// credentials token. Per OCPI 2.2.1 §4.1.2 the value is Base64-encoded, but for
// compatibility with non-encoding 2.1.1/2.2 implementations the raw value is
// returned when it is not valid Base64.
func DecodeToken(authHeader string) (string, error) {
	authHeader = strings.TrimSpace(authHeader)
	if authHeader == "" {
		return "", errors.New("core: empty Authorization header")
	}
	const scheme = "token "
	if len(authHeader) < len(scheme) || !strings.EqualFold(authHeader[:len(scheme)], scheme) {
		return "", errors.New("core: Authorization header is not a Token credential")
	}
	value := strings.TrimSpace(authHeader[len(scheme):])
	if value == "" {
		return "", errors.New("core: empty token value")
	}
	if decoded, err := base64.StdEncoding.DecodeString(value); err == nil {
		return string(decoded), nil
	}
	return value, nil
}
