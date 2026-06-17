package core

import "net/http"

// OCPI message-routing header names (OCPI 2.2.1 §4.1.8.2).
const (
	headerToPartyID       = "OCPI-to-party-id"
	headerToCountryCode   = "OCPI-to-country-code"
	headerFromPartyID     = "OCPI-from-party-id"
	headerFromCountryCode = "OCPI-from-country-code"
)

// Routing carries OCPI message-routing headers for hub/platform topologies
// (OCPI 2.2.1 §4.1.8.2). These are applied only to functional modules, never to
// configuration modules (Versions, Credentials, HubClientInfo).
type Routing struct {
	ToPartyID       string
	ToCountryCode   string
	FromPartyID     string
	FromCountryCode string
}

// IsZero reports whether no routing headers are set.
func (r Routing) IsZero() bool {
	return r == Routing{}
}

// Apply writes the OCPI-to/from-party-id/country-code headers onto h, omitting
// empty fields.
func (r Routing) Apply(h http.Header) {
	if r.ToPartyID != "" {
		h.Set(headerToPartyID, r.ToPartyID)
	}
	if r.ToCountryCode != "" {
		h.Set(headerToCountryCode, r.ToCountryCode)
	}
	if r.FromPartyID != "" {
		h.Set(headerFromPartyID, r.FromPartyID)
	}
	if r.FromCountryCode != "" {
		h.Set(headerFromCountryCode, r.FromCountryCode)
	}
}

// ParseRouting extracts the routing headers from h.
func ParseRouting(h http.Header) Routing {
	return Routing{
		ToPartyID:       h.Get(headerToPartyID),
		ToCountryCode:   h.Get(headerToCountryCode),
		FromPartyID:     h.Get(headerFromPartyID),
		FromCountryCode: h.Get(headerFromCountryCode),
	}
}
