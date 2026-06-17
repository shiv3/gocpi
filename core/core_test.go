package core

import (
	"context"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/shiv3/gocpi/core/status"
	"github.com/shiv3/gocpi/core/transport"
	"github.com/stretchr/testify/require"
)

func TestStatusCodeClasses(t *testing.T) {
	require.True(t, status.Success.IsSuccess())
	require.True(t, status.InvalidParameters.IsClientError())
	require.True(t, status.GenericServerError.IsServerError())
	require.True(t, status.GenericHubError.IsHubError())
	require.False(t, status.Success.IsClientError())
}

func TestObjectRefPath(t *testing.T) {
	ref := ObjectRef{CountryCode: "NL", PartyID: "TNM", Segments: []string{"LOC1", "EVSE1"}}
	require.Equal(t, "NL/TNM/LOC1/EVSE1", ref.Path())

	require.Equal(t, "NL/TNM", ObjectRef{CountryCode: "NL", PartyID: "TNM"}.Path())
}

func TestRequestID(t *testing.T) {
	id := NewRequestID()
	require.NotEmpty(t, id)
	require.NotEqual(t, id, NewRequestID())

	ctx := ContextWithRequestID(context.Background(), id)
	require.Equal(t, id, RequestIDFromContext(ctx))
	require.Empty(t, RequestIDFromContext(context.Background()))
}

func TestTokenEncodeDecodeRoundTrip(t *testing.T) {
	enc := EncodeToken("example-token")
	dec, err := DecodeToken("Token " + enc)
	require.NoError(t, err)
	require.Equal(t, "example-token", dec)
}

func TestDecodeTokenNonBase64Fallback(t *testing.T) {
	dec, err := DecodeToken("Token not_base64!!")
	require.NoError(t, err)
	require.Equal(t, "not_base64!!", dec)
}

func TestDecodeTokenErrors(t *testing.T) {
	for _, h := range []string{"", "Bearer xyz", "Token "} {
		_, err := DecodeToken(h)
		require.Error(t, err, "header %q should error", h)
	}
}

func TestRoutingRoundTrip(t *testing.T) {
	r := Routing{ToPartyID: "TNM", ToCountryCode: "NL", FromPartyID: "ABC", FromCountryCode: "DE"}
	h := http.Header{}
	r.Apply(h)
	require.Equal(t, r, ParseRouting(h))
	require.True(t, Routing{}.IsZero())
}

func TestPageOptsQuery(t *testing.T) {
	off, lim := 50, 25
	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	q := PageOpts{DateFrom: &from, Offset: &off, Limit: &lim}.Query()
	require.Equal(t, "2026-01-01T00:00:00Z", q.Get("date_from"))
	require.Equal(t, "50", q.Get("offset"))
	require.Equal(t, "25", q.Get("limit"))
	require.Empty(t, q.Get("date_to"))
}

func TestParsePageReq(t *testing.T) {
	q := url.Values{}
	q.Set("offset", "10")
	q.Set("limit", "5")
	q.Set("date_from", "2026-01-01T00:00:00Z")
	pr, err := ParsePageReq(q)
	require.NoError(t, err)
	require.Equal(t, 10, pr.Offset)
	require.Equal(t, 5, pr.Limit)
	require.NotNil(t, pr.DateFrom)

	_, err = ParsePageReq(url.Values{"offset": {"notnum"}})
	require.Error(t, err)
}

func TestParsePageHeaders(t *testing.T) {
	h := http.Header{}
	h.Set("X-Total-Count", "100")
	h.Set("X-Limit", "50")
	h.Set("Link", `<https://host/cdrs?offset=50&limit=50>; rel="next"`)
	total, limit, next := ParsePageHeaders(h)
	require.Equal(t, 100, total)
	require.Equal(t, 50, limit)
	require.Equal(t, "https://host/cdrs?offset=50&limit=50", next)
}

func TestPaginate(t *testing.T) {
	pages := map[string]Page[int]{
		"":   {Items: []int{1, 2}, NextURL: "p2"},
		"p2": {Items: []int{3}, NextURL: "p3"},
		"p3": {Items: []int{4, 5}},
	}
	var got []int
	for v, err := range Paginate(func(next string) (Page[int], error) {
		return pages[next], nil
	}) {
		require.NoError(t, err)
		got = append(got, v)
	}
	require.Equal(t, []int{1, 2, 3, 4, 5}, got)
}

type mapTokenStore map[string]Party

func (m mapTokenStore) Lookup(_ context.Context, token string) (Party, bool, error) {
	p, ok := m[token]
	return p, ok, nil
}

func TestFakeTransportRoundTrip(t *testing.T) {
	srv := NewServer()
	srv.Mux().Handle(http.MethodGet, "/ping", func(w http.ResponseWriter, _ *http.Request) {
		_ = WriteResponse(w, http.StatusOK, map[string]string{"msg": "pong"}, status.Success, "OK")
	})
	c := NewClient(WithHTTPClient(transport.NewFake(srv.Handler())))

	resp, err := c.Do(context.Background(), http.MethodGet, "http://example.test/ping", nil)
	require.NoError(t, err)

	out, err := Decode[map[string]string](resp)
	require.NoError(t, err)
	require.Equal(t, int(status.Success), out.StatusCode)
	require.Equal(t, "pong", out.Data["msg"])
}

func TestServerAuth(t *testing.T) {
	store := mapTokenStore{"secret": {CountryCode: "NL", PartyID: "TNM"}}
	srv := NewServer(WithTokenStore(store))
	srv.Mux().Handle(http.MethodGet, "/whoami", func(w http.ResponseWriter, r *http.Request) {
		p, ok := PartyFromContext(r.Context())
		require.True(t, ok)
		_ = WriteResponse(w, http.StatusOK, p.PartyID, status.Success, "")
	})
	fake := transport.NewFake(srv.Handler())

	c := NewClient(WithHTTPClient(fake), WithToken("secret"))
	resp, err := c.Do(context.Background(), http.MethodGet, "http://x/whoami", nil)
	require.NoError(t, err)
	out, err := Decode[string](resp)
	require.NoError(t, err)
	require.Equal(t, "TNM", out.Data)

	c2 := NewClient(WithHTTPClient(fake))
	resp2, err := c2.Do(context.Background(), http.MethodGet, "http://x/whoami", nil)
	require.NoError(t, err)
	require.Equal(t, http.StatusUnauthorized, resp2.StatusCode)
}

func TestDecodeError(t *testing.T) {
	srv := NewServer()
	srv.Mux().Handle(http.MethodGet, "/boom", func(w http.ResponseWriter, _ *http.Request) {
		_ = WriteError(w, &status.Error{Code: status.InvalidParameters, Message: "bad", HTTPStatus: http.StatusOK})
	})
	c := NewClient(WithHTTPClient(transport.NewFake(srv.Handler())))

	resp, err := c.Do(context.Background(), http.MethodGet, "http://x/boom", nil)
	require.NoError(t, err)

	_, err = Decode[map[string]any](resp)
	require.Error(t, err)
	var se *status.Error
	require.ErrorAs(t, err, &se)
	require.Equal(t, status.InvalidParameters, se.Code)
}
