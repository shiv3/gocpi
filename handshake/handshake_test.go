package handshake

import (
	"context"
	"testing"

	"github.com/shiv3/gocpi/core"
	"github.com/shiv3/gocpi/core/transport"
	"github.com/shiv3/gocpi/v221/credentials"
	"github.com/shiv3/gocpi/v221/hubclientinfo"
	"github.com/shiv3/gocpi/v221/types"
	"github.com/shiv3/gocpi/v221/versions"
	"github.com/stretchr/testify/require"
)

// TestRegistrationLoopback drives the full Versions + Credentials handshake
// between two in-process gocpi platforms over the in-memory fake transport,
// exercising the core server/client, the response envelope, and the generated
// versions/credentials/hubclientinfo/types packages end to end.
func TestRegistrationLoopback(t *testing.T) {
	const baseB = "http://b.test/ocpi"

	bCreds := credentials.Credentials{
		Token: "TOKEN_C_FROM_B",
		URL:   baseB + "/versions",
		Roles: []credentials.CredentialsRole{{
			Role:            hubclientinfo.RoleCpo,
			PartyID:         "BBB",
			CountryCode:     "NL",
			BusinessDetails: types.BusinessDetails{Name: "Party B"},
		}},
	}

	// Party B (a CPO) serves the configuration endpoints.
	var received credentials.Credentials
	srvB := core.NewServer(core.WithBaseURL(baseB))
	require.NoError(t, Mount(srvB.Mux(), ServerConfig{
		BaseURL:  baseB,
		Versions: []versions.Version{{Version: versions.VersionNumber221, URL: baseB + "/2.2.1"}},
		Details: func(v versions.VersionNumber) (versions.VersionDetails, bool) {
			if v != versions.VersionNumber221 {
				return versions.VersionDetails{}, false
			}
			return versions.VersionDetails{
				Version: versions.VersionNumber221,
				Endpoints: []versions.Endpoint{{
					Identifier: versions.ModuleIDCredentials,
					Role:       versions.InterfaceRoleReceiver,
					URL:        baseB + "/2.2.1/credentials",
				}},
			}, true
		},
		OnRegister: func(_ context.Context, peer credentials.Credentials) (credentials.Credentials, error) {
			received = peer
			return bCreds, nil
		},
	}))

	// Party A (an eMSP) registers with B over the in-memory transport.
	clientA := core.NewClient(
		core.WithHTTPClient(transport.NewFake(srvB.Handler())),
		core.WithToken("TOKEN_A"),
	)
	aCreds := credentials.Credentials{
		Token: "TOKEN_B_FROM_A",
		URL:   "http://a.test/ocpi/versions",
		Roles: []credentials.CredentialsRole{{
			Role:            hubclientinfo.RoleEmsp,
			PartyID:         "AAA",
			CountryCode:     "DE",
			BusinessDetails: types.BusinessDetails{Name: "Party A"},
		}},
	}

	peer, err := Register(context.Background(), clientA, RegisterRequest{
		PeerVersionsURL: baseB + "/versions",
		PreferVersion:   versions.VersionNumber221,
		OurCredentials:  aCreds,
	})
	require.NoError(t, err)

	// A learned B's negotiated version, endpoints and new token.
	require.Equal(t, versions.VersionNumber221, peer.Version)
	require.Equal(t, "TOKEN_C_FROM_B", peer.Credentials.Token)
	credURL, ok := peer.Endpoint(versions.ModuleIDCredentials)
	require.True(t, ok)
	require.Equal(t, baseB+"/2.2.1/credentials", credURL)

	// B received A's credentials during registration.
	require.Equal(t, "TOKEN_B_FROM_A", received.Token)
	require.Len(t, received.Roles, 1)
	require.Equal(t, "AAA", received.Roles[0].PartyID)
	require.Equal(t, hubclientinfo.RoleEmsp, received.Roles[0].Role)
}
