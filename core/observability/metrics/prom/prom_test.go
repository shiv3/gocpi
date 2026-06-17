package prom

import (
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"
)

func TestPromMetricsObserve(t *testing.T) {
	reg := prometheus.NewRegistry()
	m := New(reg)

	m.ObserveClient("GET", 200, 12*time.Millisecond)
	m.ObserveServer("GET", "/locations", 200, 5*time.Millisecond)

	mfs, err := reg.Gather()
	require.NoError(t, err)
	require.NotEmpty(t, mfs)

	names := make(map[string]bool)
	for _, mf := range mfs {
		names[mf.GetName()] = true
	}
	require.True(t, names["gocpi_client_requests_total"])
	require.True(t, names["gocpi_server_requests_total"])
}
