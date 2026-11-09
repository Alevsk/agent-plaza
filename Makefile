.PHONY: build build-web build-go build-multiarch docker-build docker-build-multiarch run dev test

build: build-web build-go

build-web:
	cd web && npm run build

build-go:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/agents-workspace ./cmd/server

build-multiarch:
	bash scripts/build-multiarch.sh

docker-build:
	docker build -t agents-animated-workspace:latest .

docker-build-multiarch:
	docker buildx build --platform linux/amd64,linux/arm64 -t agents-animated-workspace:latest .

run: build
	./bin/agents-workspace -config config.yaml

test:
	go test ./...
