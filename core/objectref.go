package core

import "strings"

// ObjectRef identifies a client-owned object by its URL parts
// ({country_code}/{party_id}/{segments...}); see OCPI 2.2.1 §4.1.5. It is used by
// Receiver-interface client calls (PUT/PATCH/GET on client-owned objects).
type ObjectRef struct {
	CountryCode string
	PartyID     string
	Segments    []string // e.g. [locationID, evseUID, connectorID]
}

// Path renders the ref as "{country}/{party}/{seg0}/{seg1}...".
func (r ObjectRef) Path() string {
	parts := make([]string, 0, 2+len(r.Segments))
	parts = append(parts, r.CountryCode, r.PartyID)
	parts = append(parts, r.Segments...)
	return strings.Join(parts, "/")
}
