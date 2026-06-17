package core

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/shiv3/gocpi/core/observability"
	"github.com/shiv3/gocpi/core/status"
)

// context keys for values injected by the server middleware.
type (
	partyKey   struct{}
	routingKey struct{}
)

// Server is the base OCPI HTTP server. Its Handler applies auth, routing-header
// extraction, envelope-friendly panic recovery and request-ID propagation around
// the routes registered by generated RegisterXxx functions.
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
func NewServer(opts ...ServerOption) *Server {
	s := &Server{
		logger:  slog.Default(),
		metrics: observability.NoopMetrics{},
		mux:     &Mux{mux: http.NewServeMux()},
	}
	for _, opt := range opts {
		opt(s)
	}
	if s.logger == nil {
		s.logger = slog.Default()
	}
	if s.metrics == nil {
		s.metrics = observability.NoopMetrics{}
	}
	if s.mux == nil {
		s.mux = &Mux{mux: http.NewServeMux()}
	}
	return s
}

// Mux returns the route registry that generated RegisterXxx functions use.
func (s *Server) Mux() *Mux { return s.mux }

// BaseURL returns the externally-visible base URL advertised to peers.
func (s *Server) BaseURL() string { return s.baseURL }

// Metrics returns the configured metrics sink.
func (s *Server) Metrics() observability.Metrics { return s.metrics }

// Handler returns the http.Handler serving the registered OCPI endpoints. It does
// relative-path routing, so it can be mounted under any prefix in net/http, chi,
// echo, etc. (use http.StripPrefix when mounting under a prefix).
func (s *Server) Handler() http.Handler {
	h := http.Handler(s.mux)
	h = s.metricsMiddleware(h)
	h = s.authMiddleware(h)
	h = s.contextMiddleware(h)
	h = s.recoverMiddleware(h)
	return h
}

// statusRecorder captures the response status code for metrics.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// metricsMiddleware records server request observations. It wraps the mux so the
// matched route pattern (r.Pattern) is available.
func (s *Server) metricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r)
		s.metrics.ObserveServer(r.Method, r.Pattern, rec.status, time.Since(start))
	})
}

// recoverMiddleware converts handler panics into an OCPI 3000 error envelope.
func (s *Server) recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				s.logger.Error("gocpi: recovered panic in handler", "panic", rec, "path", r.URL.Path)
				_ = WriteError(w, status.GenericServer("internal server error"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// contextMiddleware propagates the request ID and parses OCPI routing headers.
func (s *Server) contextMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			id = NewRequestID()
		}
		w.Header().Set("X-Request-ID", id)

		ctx := ContextWithRequestID(r.Context(), id)
		ctx = context.WithValue(ctx, routingKey{}, ParseRouting(r.Header))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// authMiddleware authenticates the request against the TokenStore (when set) and
// puts the resolved Party into the request context.
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.tokenStore == nil {
			next.ServeHTTP(w, r)
			return
		}
		token, err := DecodeToken(r.Header.Get("Authorization"))
		if err != nil {
			_ = WriteError(w, &status.Error{Code: status.GenericClientError, Message: "missing or invalid Authorization header", HTTPStatus: http.StatusUnauthorized})
			return
		}
		party, ok, err := s.tokenStore.Lookup(r.Context(), token)
		if err != nil {
			_ = WriteError(w, status.GenericServer("token lookup failed"))
			return
		}
		if !ok {
			_ = WriteError(w, &status.Error{Code: status.GenericClientError, Message: "unknown token", HTTPStatus: http.StatusUnauthorized})
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), partyKey{}, party)))
	})
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

// PartyFromContext returns the authenticated Party for the request, if any.
func PartyFromContext(ctx context.Context) (Party, bool) {
	p, ok := ctx.Value(partyKey{}).(Party)
	return p, ok
}

// RoutingFromContext returns the OCPI routing headers parsed from the request.
func RoutingFromContext(ctx context.Context) (Routing, bool) {
	rt, ok := ctx.Value(routingKey{}).(Routing)
	return rt, ok
}

// Mux is a thin wrapper over *http.ServeMux using Go 1.22 "METHOD /pattern"
// routing, so gocpi needs no third-party router dependency.
type Mux struct {
	mux *http.ServeMux
}

// Handle registers h for the given method and pattern (e.g. "GET", "/locations").
// An empty method registers the pattern for all methods.
func (m *Mux) Handle(method, pattern string, h http.HandlerFunc) {
	if method == "" {
		m.mux.Handle(pattern, h)
		return
	}
	m.mux.Handle(method+" "+pattern, h)
}

// ServeHTTP implements http.Handler.
func (m *Mux) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	m.mux.ServeHTTP(w, r)
}
