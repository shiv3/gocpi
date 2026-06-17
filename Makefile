.PHONY: build generate test test-race lint vet fmt tidy

build:
	go build ./...

# Regenerate v221 types/clients/server handlers from the vendored OpenAPI spec.
generate:
	go run ./internal/codegen -version 2.2.1

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
