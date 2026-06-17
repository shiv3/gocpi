package transport

import (
	"net/http"
	"net/http/httptest"
)

// Fake is an in-memory Doer that routes requests directly into an http.Handler
// without using sockets. It is intended for fast end-to-end tests that wire a
// gocpi server's handler straight to a gocpi client.
type Fake struct {
	handler http.Handler
}

// NewFake returns a Fake that dispatches requests to h.
func NewFake(h http.Handler) *Fake {
	return &Fake{handler: h}
}

// Do dispatches req to the wrapped handler and returns the recorded response.
func (f *Fake) Do(req *http.Request) (*http.Response, error) {
	rec := httptest.NewRecorder()
	f.handler.ServeHTTP(rec, req)
	return rec.Result(), nil
}
