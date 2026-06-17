// Package builddeps pins the external dependencies that the implementation and
// codegen tracks (M1-A core bodies, M1-B codegen) will use, so they are present
// in go.mod before those packages import them. This lets parallel agents work
// without modifying go.mod concurrently.
//
// This file is temporary scaffolding. Remove it once the dependencies below are
// referenced by real code.
package builddeps

import (
	_ "github.com/go-playground/validator/v10"
	_ "github.com/oklog/ulid/v2"
	_ "github.com/pb33f/libopenapi"
	_ "github.com/prometheus/client_golang/prometheus"
	_ "github.com/santhosh-tekuri/jsonschema/v6"
	_ "github.com/stretchr/testify/require"
	_ "go.opentelemetry.io/otel"
	_ "go.opentelemetry.io/otel/metric"
	_ "go.opentelemetry.io/otel/trace"
)
