package core

import "net/http"

// Routing carries OCPI message-routing headers for hub/platform topologies
// (OCPI 2.2.1 §4.1.8.2). These are applied only to functional modules, never to
// configuration modules (Versions, Credentials, HubClientInfo).
type Routing struct {
	ToPartyID       string
	ToCountryCode   string
	FromPartyID     string
	FromCountryCode string
}

// Apply writes the OCPI-to/from-party-id/country-code headers onto h.
//
// TODO(core, M1-A): implement.
func (r Routing) Apply(h http.Header) {
	panic("not implemented: core.Routing.Apply")
}

// ParseRouting extracts the routing headers from h.
//
// TODO(core, M1-A): implement.
func ParseRouting(h http.Header) Routing {
	panic("not implemented: core.ParseRouting")
}
