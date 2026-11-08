.PHONY: build build-web build-go run dev test

build: build-web build-go

build-web:
	cd web && npm run build

build-go:
	go build -o bin/agents-workspace ./cmd/server

run: build
	./bin/agents-workspace -config config.yaml

test:
	go test ./...
