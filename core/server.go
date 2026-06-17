package core

import (
	"log/slog"
	"net/http"

	"github.com/shiv3/gocpi/core/observability"
)

// Server is the base OCPI HTTP server. Its Handler applies auth, routing-header
// extraction, envelope encoding, pagination headers, panic recovery and
// observability around the routes registered by generated RegisterXxx functions.
type Server struct {
	baseURL    string
	tokenStore TokenStore
	logger     *slog.Logger
	metrics    observability.Metrics
	mux        *Mux
}

// ServerOption configures a Server.
type ServerOption func(*Server)

// NewServer returns a new Server configured by opts.
//
// TODO(core, M1-A): implement.
func NewServer(opts ...ServerOption) *Server {
	panic("not implemented: core.NewServer")
}

// Handler returns the http.Handler serving the registered OCPI endpoints. It can
// be mounted under any prefix in net/http, chi, echo, etc.
//
// TODO(core, M1-A): implement.
func (s *Server) Handler() http.Handler {
	panic("not implemented: core.Server.Handler")
}

// Mux returns the route registry that generated RegisterXxx functions use.
//
// TODO(core, M1-A): implement.
func (s *Server) Mux() *Mux {
	panic("not implemented: core.Server.Mux")
}

// WithBaseURL sets the externally-visible base URL advertised to peers in the
// Versions endpoint and used to build client-owned-object URLs. It is
// independent of where the Handler is actually mounted.
func WithBaseURL(base string) ServerOption { return func(s *Server) { s.baseURL = base } }

// WithTokenStore sets the inbound credentials-token store.
func WithTokenStore(ts TokenStore) ServerOption { return func(s *Server) { s.tokenStore = ts } }

// WithServerLogger sets the server logger.
func WithServerLogger(l *slog.Logger) ServerOption { return func(s *Server) { s.logger = l } }

// WithMetrics sets the metrics sink.
func WithMetrics(m observability.Metrics) ServerOption { return func(s *Server) { s.metrics = m } }

// Mux is a thin wrapper over *http.ServeMux using Go 1.22 "METHOD /pattern"
// routing, so gocpi needs no third-party router dependency.
type Mux struct {
	mux *http.ServeMux
}

// Handle registers h for the given method and pattern (e.g. "GET", "/locations").
//
// TODO(core, M1-A): implement.
func (m *Mux) Handle(method, pattern string, h http.HandlerFunc) {
	panic("not implemented: core.Mux.Handle")
}

// ServeHTTP implements http.Handler.
func (m *Mux) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	m.mux.ServeHTTP(w, r)
}
