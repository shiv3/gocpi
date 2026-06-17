.PHONY: build generate test test-race lint vet fmt tidy

build:
	go build ./...

# Regenerate the version packages from the vendored OpenAPI specs.
generate:
	go run ./internal/codegen -version 2.2.1
	go run ./internal/codegen -version 2.3.0

test:
	go test ./...

test-race:
	go test -race ./...

lint:
	golangci-lint run

vet:
	go vet ./...

fmt:
	gofmt -w .

tidy:
	go mod tidy
