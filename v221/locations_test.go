package v221_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/shiv3/gocpi/core"
	"github.com/shiv3/gocpi/core/status"
	"github.com/shiv3/gocpi/core/transport"
	"github.com/shiv3/gocpi/v221"
	"github.com/stretchr/testify/require"
)

// locSender is a minimal Locations Sender handler for the round-trip test.
type locSender struct{ locs []v221.Location }

func (s *locSender) GetLocations(_ context.Context, _ core.PageReq) (core.Page[v221.Location], *status.Error) {
	return core.Page[v221.Location]{Items: s.locs, TotalCount: len(s.locs)}, nil
}

func (s *locSender) GetLocation(_ context.Context, locationID string) (v221.Location, *status.Error) {
	for _, l := range s.locs {
		if l.ID == locationID {
			return l, nil
		}
	}
	return v221.Location{}, &status.Error{Code: status.UnknownLocation, Message: "no such location", HTTPStatus: http.StatusNotFound}
}

func (s *locSender) GetEvse(_ context.Context, _, _ string) (v221.EVSE, *status.Error) {
	return v221.EVSE{}, status.GenericServer("not implemented")
}

func (s *locSender) GetConnector(_ context.Context, _, _, _ string) (v221.Connector, *status.Error) {
	return v221.Connector{}, status.GenericServer("not implemented")
}

// TestLocationsSenderRoundTrip drives the generated Locations Sender client
// against the generated server registration over the in-memory transport,
// proving the generated client + server interoperate end to end.
func TestLocationsSenderRoundTrip(t *testing.T) {
	const base = "/ocpi/2.2.1/locations"

	srv := core.NewServer()
	v221.RegisterLocationsSender(srv.Mux(), base, &locSender{locs: []v221.Location{
		{CountryCode: "NL", PartyID: "TNM", ID: "LOC1", City: "Amsterdam"},
		{CountryCode: "NL", PartyID: "TNM", ID: "LOC2", City: "Rotterdam"},
	}})

	client := v221.NewLocationsSenderClient(
		core.NewClient(core.WithHTTPClient(transport.NewFake(srv.Handler()))),
		"http://cpo.test"+base,
	)

	// Paginated list.
	page, err := client.GetLocations(context.Background(), core.PageOpts{})
	require.NoError(t, err)
	require.Len(t, page.Items, 2)
	require.Equal(t, 2, page.TotalCount)
	require.Equal(t, "Amsterdam", page.Items[0].City)

	// Single object by path param.
	loc, err := client.GetLocation(context.Background(), "LOC2")
	require.NoError(t, err)
	require.Equal(t, "Rotterdam", loc.City)

	// OCPI status-code error mapping.
	_, err = client.GetLocation(context.Background(), "NOPE")
	require.Error(t, err)
	var se *status.Error
	require.ErrorAs(t, err, &se)
	require.Equal(t, status.UnknownLocation, se.Code)
}
