// Package transport abstracts the HTTP transport used by the gocpi client,
// decoupling protocol logic from the concrete HTTP stack and enabling in-memory
// testing.
package transport

import "net/http"

// Doer performs an HTTP request. *http.Client satisfies this interface.
type Doer interface {
	Do(req *http.Request) (*http.Response, error)
}
