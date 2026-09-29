// Copyright (c) 2026 Devrecated.
package main

import (
	"os"

	"github.com/devrecated/autodevelop-cli/internal/cli"
)

func main() {
	os.Exit(cli.Run(os.Args[1:]))
}
