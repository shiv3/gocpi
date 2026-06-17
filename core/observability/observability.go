// Package observability defines pluggable metrics for the gocpi client and
// server. Adapters for Prometheus and OpenTelemetry live in subpackages.
package observability

import "time"

// Metrics receives request observations from the gocpi client and server.
type Metrics interface {
	// ObserveClient is called after each outbound request completes.
	ObserveClient(method string, statusCode int, dur time.Duration)
	// ObserveServer is called after each inbound request is served. route is the
	// matched mux pattern (may be empty for unmatched requests).
	ObserveServer(method, route string, statusCode int, dur time.Duration)
}

// NoopMetrics is a Metrics implementation that does nothing.
type NoopMetrics struct{}

// ObserveClient implements Metrics.
func (NoopMetrics) ObserveClient(method string, statusCode int, dur time.Duration) {}

// ObserveServer implements Metrics.
func (NoopMetrics) ObserveServer(method, route string, statusCode int, dur time.Duration) {}
