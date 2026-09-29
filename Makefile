# Copyright (c) 2026 Devrecated.

.PHONY: build test snapshot

build:
	go build -o bin/autodevelop ./cmd/autodevelop

test:
	go test ./...

snapshot:
	goreleaser release --snapshot --clean
