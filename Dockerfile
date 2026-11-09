# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Stage 1: Build Frontend SPA (React 19 + Vite + TypeScript)
# -----------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:22-alpine AS web-builder
WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Build Backend Server (Hexagonal Go Server with Embedded Assets)
# -----------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS go-builder
WORKDIR /app

ARG TARGETOS
ARG TARGETARCH

ENV CGO_ENABLED=0 \
    GOOS=${TARGETOS:-linux} \
    GOARCH=${TARGETARCH:-amd64} \
    GOTOOLCHAIN=auto

COPY go.mod go.sum ./
RUN go mod download

# Copy backend sources, embedded templates, and built web dist
COPY cmd/ ./cmd/
COPY internal/ ./internal/
COPY templates/ ./templates/
COPY web/web.go ./web/web.go
COPY --from=web-builder /app/web/dist ./web/dist

RUN go build -trimpath -ldflags="-s -w" -o /out/agents-workspace ./cmd/server

# -----------------------------------------------------------------------------
# Stage 3: Minimal Multi-Arch Production Runtime
# -----------------------------------------------------------------------------
FROM alpine:3.21

RUN apk add --no-cache \
    ca-certificates \
    bash \
    curl \
    jq \
    tzdata && \
    addgroup -S workspace && \
    adduser -S -G workspace -h /home/workspace workspace

WORKDIR /app

COPY --from=go-builder /out/agents-workspace /app/agents-workspace
COPY templates/ /app/templates/
COPY config.yaml /app/config.yaml

RUN chown -R workspace:workspace /app /home/workspace
USER workspace

ENV HOST="0.0.0.0" \
    PORT="8080" \
    TEMPLATES_DIR="/app/templates"

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/api/snapshot >/dev/null || exit 1

ENTRYPOINT ["/app/agents-workspace"]
CMD ["-config", "/app/config.yaml"]
