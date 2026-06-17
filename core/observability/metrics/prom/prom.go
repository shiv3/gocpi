// Package prom provides a Prometheus-backed observability.Metrics implementation.
package prom

import (
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/shiv3/gocpi/core/observability"
)

// Metrics implements observability.Metrics using Prometheus collectors.
type Metrics struct {
	clientReqs *prometheus.CounterVec
	clientDur  *prometheus.HistogramVec
	serverReqs *prometheus.CounterVec
	serverDur  *prometheus.HistogramVec
}

var _ observability.Metrics = (*Metrics)(nil)

// New registers gocpi's collectors with reg and returns the Metrics.
func New(reg prometheus.Registerer) *Metrics {
	m := &Metrics{
		clientReqs: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "gocpi", Subsystem: "client", Name: "requests_total",
			Help: "Total OCPI client requests by method and status.",
		}, []string{"method", "status"}),
		clientDur: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: "gocpi", Subsystem: "client", Name: "request_duration_seconds",
			Help: "OCPI client request duration in seconds.", Buckets: prometheus.DefBuckets,
		}, []string{"method"}),
		serverReqs: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "gocpi", Subsystem: "server", Name: "requests_total",
			Help: "Total OCPI server requests by method, route and status.",
		}, []string{"method", "route", "status"}),
		serverDur: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: "gocpi", Subsystem: "server", Name: "request_duration_seconds",
			Help: "OCPI server request duration in seconds.", Buckets: prometheus.DefBuckets,
		}, []string{"method", "route"}),
	}
	reg.MustRegister(m.clientReqs, m.clientDur, m.serverReqs, m.serverDur)
	return m
}

// ObserveClient implements observability.Metrics.
func (m *Metrics) ObserveClient(method string, statusCode int, dur time.Duration) {
	m.clientReqs.WithLabelValues(method, strconv.Itoa(statusCode)).Inc()
	m.clientDur.WithLabelValues(method).Observe(dur.Seconds())
}

// ObserveServer implements observability.Metrics.
func (m *Metrics) ObserveServer(method, route string, statusCode int, dur time.Duration) {
	m.serverReqs.WithLabelValues(method, route, strconv.Itoa(statusCode)).Inc()
	m.serverDur.WithLabelValues(method, route).Observe(dur.Seconds())
}
