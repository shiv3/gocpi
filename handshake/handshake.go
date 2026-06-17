// Package handshake implements the OCPI Versions + Credentials registration
// handshake (OCPI 2.2.1 §6 and §7) on top of the core transport. It is
// role-agnostic: every OCPI platform both serves these configuration endpoints
// and calls them on its peers.
package handshake

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/shiv3/gocpi/core"
	"github.com/shiv3/gocpi/core/status"
	"github.com/shiv3/gocpi/v221/credentials"
	"github.com/shiv3/gocpi/v221/versions"
)

// Peer is the outcome of registering with another OCPI platform: the negotiated
// version, the peer's advertised endpoints, and the credentials (including the
// token to use for subsequent requests) the peer returned.
type Peer struct {
	Version     versions.VersionNumber
	Endpoints   []versions.Endpoint
	Credentials credentials.Credentials
}

// Endpoint returns the URL the peer advertised for the given module, if any.
func (p Peer) Endpoint(id versions.ModuleID) (string, bool) {
	for _, e := range p.Endpoints {
		if e.Identifier == id {
			return e.URL, true
		}
	}
	return "", false
}

// ServerConfig configures the configuration-module endpoints served by Mount.
type ServerConfig struct {
	// BaseURL is this platform's externally-visible OCPI base URL, e.g.
	// "https://example.com/ocpi". Its path determines the registered routes.
	BaseURL string
	// Versions is advertised at GET {base}/versions.
	Versions []versions.Version
	// Details returns the VersionDetails for a requested version number.
	Details func(versions.VersionNumber) (versions.VersionDetails, bool)
	// OnRegister handles an inbound credentials POST (registration). It receives
	// the caller's credentials and returns this platform's credentials — with a
	// freshly generated token — to hand back.
	OnRegister func(ctx context.Context, peer credentials.Credentials) (credentials.Credentials, error)
}

// Mount registers the Versions and Credentials endpoints on mux at the path of
// cfg.BaseURL.
func Mount(mux *core.Mux, cfg ServerConfig) error {
	u, err := url.Parse(cfg.BaseURL)
	if err != nil {
		return fmt.Errorf("handshake: invalid BaseURL: %w", err)
	}
	base := strings.TrimRight(u.Path, "/")

	mux.Handle(http.MethodGet, base+"/versions", func(w http.ResponseWriter, _ *http.Request) {
		_ = core.WriteResponse(w, http.StatusOK, cfg.Versions, status.Success, "")
	})

	mux.Handle(http.MethodGet, base+"/{version}", func(w http.ResponseWriter, r *http.Request) {
		d, ok := cfg.Details(versions.VersionNumber(r.PathValue("version")))
		if !ok {
			_ = core.WriteError(w, &status.Error{Code: status.UnsupportedVersion, Message: "unsupported version", HTTPStatus: http.StatusNotFound})
			return
		}
		_ = core.WriteResponse(w, http.StatusOK, d, status.Success, "")
	})

	mux.Handle(http.MethodPost, base+"/{version}/credentials", func(w http.ResponseWriter, r *http.Request) {
		var peer credentials.Credentials
		if err := json.NewDecoder(r.Body).Decode(&peer); err != nil {
			_ = core.WriteError(w, status.GenericClient("invalid credentials body"))
			return
		}
		out, err := cfg.OnRegister(r.Context(), peer)
		if err != nil {
			_ = core.WriteError(w, status.GenericServer(err.Error()))
			return
		}
		_ = core.WriteResponse(w, http.StatusOK, out, status.Success, "")
	})
	return nil
}

// RegisterRequest holds the inputs for registering with a peer.
type RegisterRequest struct {
	PeerVersionsURL string
	PreferVersion   versions.VersionNumber
	OurCredentials  credentials.Credentials
}

// Discover fetches the peer's supported versions, selects the preferred version,
// and returns its details (endpoints).
func Discover(ctx context.Context, c *core.Client, versionsURL string, prefer versions.VersionNumber) (versions.VersionDetails, error) {
	resp, err := c.Do(ctx, http.MethodGet, versionsURL, nil)
	if err != nil {
		return versions.VersionDetails{}, err
	}
	vs, err := core.Decode[[]versions.Version](resp)
	if err != nil {
		return versions.VersionDetails{}, err
	}
	var detailsURL string
	for _, v := range vs.Data {
		if v.Version == prefer {
			detailsURL = v.URL
		}
	}
	if detailsURL == "" {
		return versions.VersionDetails{}, fmt.Errorf("handshake: peer does not offer version %s", prefer)
	}
	resp2, err := c.Do(ctx, http.MethodGet, detailsURL, nil)
	if err != nil {
		return versions.VersionDetails{}, err
	}
	det, err := core.Decode[versions.VersionDetails](resp2)
	if err != nil {
		return versions.VersionDetails{}, err
	}
	return det.Data, nil
}

// Register performs the client side of the OCPI registration handshake: discover
// the peer's endpoints for the preferred version, POST our credentials to the
// peer's Credentials endpoint, and return the resulting Peer.
func Register(ctx context.Context, c *core.Client, req RegisterRequest) (*Peer, error) {
	det, err := Discover(ctx, c, req.PeerVersionsURL, req.PreferVersion)
	if err != nil {
		return nil, err
	}
	var credURL string
	for _, e := range det.Endpoints {
		if e.Identifier == versions.ModuleIDCredentials {
			credURL = e.URL
		}
	}
	if credURL == "" {
		return nil, errors.New("handshake: peer advertises no credentials endpoint")
	}
	resp, err := c.Do(ctx, http.MethodPost, credURL, req.OurCredentials)
	if err != nil {
		return nil, err
	}
	out, err := core.Decode[credentials.Credentials](resp)
	if err != nil {
		return nil, err
	}
	return &Peer{Version: det.Version, Endpoints: det.Endpoints, Credentials: out.Data}, nil
}
