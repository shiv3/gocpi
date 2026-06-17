package handshake

import (
	"context"
	"testing"

	"github.com/shiv3/gocpi/core"
	"github.com/shiv3/gocpi/core/transport"
	"github.com/shiv3/gocpi/v221"
	"github.com/stretchr/testify/require"
)

// TestRegistrationLoopback drives the full Versions + Credentials handshake
// between two in-process gocpi platforms over the in-memory fake transport,
// exercising the core server/client, the response envelope, and the generated
// v221 types end to end.
func TestRegistrationLoopback(t *testing.T) {
	const baseB = "http://b.test/ocpi"

	bCreds := v221.Credentials{
		Token: "TOKEN_C_FROM_B",
		URL:   baseB + "/versions",
		Roles: []v221.CredentialsRole{{
			Role:            v221.RoleCpo,
			PartyID:         "BBB",
			CountryCode:     "NL",
			BusinessDetails: v221.BusinessDetails{Name: "Party B"},
		}},
	}

	// Party B (a CPO) serves the configuration endpoints.
	var received v221.Credentials
	srvB := core.NewServer(core.WithBaseURL(baseB))
	require.NoError(t, Mount(srvB.Mux(), ServerConfig{
		BaseURL:  baseB,
		Versions: []v221.Version{{Version: v221.VersionNumber221, URL: baseB + "/2.2.1"}},
		Details: func(v v221.VersionNumber) (v221.VersionDetails, bool) {
			if v != v221.VersionNumber221 {
				return v221.VersionDetails{}, false
			}
			return v221.VersionDetails{
				Version: v221.VersionNumber221,
				Endpoints: []v221.Endpoint{{
					Identifier: v221.ModuleIDCredentials,
					Role:       v221.InterfaceRoleReceiver,
					URL:        baseB + "/2.2.1/credentials",
				}},
			}, true
		},
		OnRegister: func(_ context.Context, peer v221.Credentials) (v221.Credentials, error) {
			received = peer
			return bCreds, nil
		},
	}))

	// Party A (an eMSP) registers with B over the in-memory transport.
	clientA := core.NewClient(
		core.WithHTTPClient(transport.NewFake(srvB.Handler())),
		core.WithToken("TOKEN_A"),
	)
	aCreds := v221.Credentials{
		Token: "TOKEN_B_FROM_A",
		URL:   "http://a.test/ocpi/versions",
		Roles: []v221.CredentialsRole{{
			Role:            v221.RoleEmsp,
			PartyID:         "AAA",
			CountryCode:     "DE",
			BusinessDetails: v221.BusinessDetails{Name: "Party A"},
		}},
	}

	peer, err := Register(context.Background(), clientA, RegisterRequest{
		PeerVersionsURL: baseB + "/versions",
		PreferVersion:   v221.VersionNumber221,
		OurCredentials:  aCreds,
	})
	require.NoError(t, err)

	// A learned B's negotiated version, endpoints and new token.
	require.Equal(t, v221.VersionNumber221, peer.Version)
	require.Equal(t, "TOKEN_C_FROM_B", peer.Credentials.Token)
	credURL, ok := peer.Endpoint(v221.ModuleIDCredentials)
	require.True(t, ok)
	require.Equal(t, baseB+"/2.2.1/credentials", credURL)

	// B received A's credentials during registration.
	require.Equal(t, "TOKEN_B_FROM_A", received.Token)
	require.Len(t, received.Roles, 1)
	require.Equal(t, "AAA", received.Roles[0].PartyID)
	require.Equal(t, v221.RoleEmsp, received.Roles[0].Role)
}
