// Command dual-role demonstrates a minimal OCPI 2.2.1 exchange with gocpi: a CPO
// platform serves the Versions/Credentials handshake and the Locations Sender
// interface, and an eMSP registers and fetches Locations.
//
// For brevity the two parties are wired together in-process over gocpi's
// in-memory transport; in production each side would use a real http.Server
// (mount srv.Handler()) and a real *http.Client.
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/shiv3/gocpi/core"
	"github.com/shiv3/gocpi/core/status"
	"github.com/shiv3/gocpi/core/transport"
	"github.com/shiv3/gocpi/handshake"
	"github.com/shiv3/gocpi/v221"
)

const cpoBase = "http://cpo.example/ocpi"

// cpoLocations implements the CPO's Locations Sender interface.
type cpoLocations struct{}

func (cpoLocations) GetLocations(_ context.Context, _ core.PageReq) (core.Page[v221.Location], *status.Error) {
	return core.Page[v221.Location]{
		Items: []v221.Location{{
			CountryCode: "NL", PartyID: "TNM", ID: "LOC1",
			Address: "Pier 11", City: "Amsterdam", Country: "NLD",
			Coordinates: v221.GeoLocation{Latitude: "52.372", Longitude: "4.900"},
			TimeZone:    "Europe/Amsterdam",
			LastUpdated: time.Now().UTC(),
		}},
		TotalCount: 1,
	}, nil
}

func (cpoLocations) GetLocation(_ context.Context, _ string) (v221.Location, *status.Error) {
	return v221.Location{}, &status.Error{Code: status.UnknownLocation, HTTPStatus: 404}
}
func (cpoLocations) GetEvse(_ context.Context, _, _ string) (v221.EVSE, *status.Error) {
	return v221.EVSE{}, status.GenericServer("not implemented")
}
func (cpoLocations) GetConnector(_ context.Context, _, _, _ string) (v221.Connector, *status.Error) {
	return v221.Connector{}, status.GenericServer("not implemented")
}

func main() {
	// --- CPO platform (server side) ---
	cpo := core.NewServer(core.WithBaseURL(cpoBase))

	// Versions + Credentials handshake endpoints.
	must(handshake.Mount(cpo.Mux(), handshake.ServerConfig{
		BaseURL:  cpoBase,
		Versions: []v221.Version{{Version: v221.VersionNumber221, URL: cpoBase + "/2.2.1"}},
		Details: func(v v221.VersionNumber) (v221.VersionDetails, bool) {
			return v221.VersionDetails{
				Version: v221.VersionNumber221,
				Endpoints: []v221.Endpoint{
					{Identifier: v221.ModuleIDCredentials, Role: v221.InterfaceRoleReceiver, URL: cpoBase + "/2.2.1/credentials"},
					{Identifier: v221.ModuleIDLocations, Role: v221.InterfaceRoleSender, URL: cpoBase + "/2.2.1/locations"},
				},
			}, v == v221.VersionNumber221
		},
		OnRegister: func(_ context.Context, _ v221.Credentials) (v221.Credentials, error) {
			return v221.Credentials{Token: "CREDENTIALS_TOKEN_C", URL: cpoBase + "/versions"}, nil
		},
	}))

	// Functional-module endpoints for the CPO role.
	v221.RegisterCPO(cpo.Mux(), cpoBase+"/2.2.1", v221.CPOHandlers{Locations: cpoLocations{}})

	// --- eMSP platform (client side) ---
	// In production: core.NewClient() reaches the CPO over HTTP. Here it is wired
	// directly to the CPO handler in-process.
	emsp := core.NewClient(
		core.WithHTTPClient(transport.NewFake(cpo.Handler())),
		core.WithToken("CREDENTIALS_TOKEN_A"),
	)
	ctx := context.Background()

	// 1) Register with the CPO (Versions + Credentials handshake).
	peer, err := handshake.Register(ctx, emsp, handshake.RegisterRequest{
		PeerVersionsURL: cpoBase + "/versions",
		PreferVersion:   v221.VersionNumber221,
		OurCredentials: v221.Credentials{
			Token: "CREDENTIALS_TOKEN_B",
			URL:   "http://emsp.example/ocpi/versions",
			Roles: []v221.CredentialsRole{{
				Role: v221.RoleEmsp, PartyID: "EMS", CountryCode: "DE",
				BusinessDetails: v221.BusinessDetails{Name: "Example eMSP"},
			}},
		},
	})
	must(err)
	fmt.Printf("registered with CPO: version=%s token=%s\n", peer.Version, peer.Credentials.Token)

	// 2) Fetch Locations via the discovered endpoint using the generated client.
	locURL, ok := peer.Endpoint(v221.ModuleIDLocations)
	if !ok {
		log.Fatal("CPO did not advertise a locations endpoint")
	}
	locations := v221.NewLocationsSenderClient(emsp, locURL)
	page, err := locations.GetLocations(ctx, core.PageOpts{})
	must(err)
	fmt.Printf("fetched %d location(s); first: %s in %s\n", page.TotalCount, page.Items[0].ID, page.Items[0].City)
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
