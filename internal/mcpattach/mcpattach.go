// Copyright (c) 2026 Devrecated.
package mcpattach

import "github.com/devrecated/autodevelop-cli/internal/host"

func IsRemote(origin string) bool { return host.IsRemoteMCPHost(origin) }

func HTTPURL(origin string) string { return host.HostMCPHTTPURL(origin) }
