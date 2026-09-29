// Copyright (c) 2026 Devrecated.
package host

import (
	"errors"
	"net/url"
	"os"
	"strings"
)

const DefaultHost = "https://brain.devrecated.com"

const BillingExpired = "Your billing has expired. Renew to keep using Autodevelop."

// Origin resolves the Autodevelop host: flag, then AUTODEVELOP_HOST, then stored, then default.
func Origin(env map[string]string, override, storedHost string) string {
	if env == nil {
		env = environMap()
	}
	if v := strings.TrimSpace(override); v != "" {
		return strings.TrimRight(v, "/")
	}
	if v := strings.TrimSpace(env["AUTODEVELOP_HOST"]); v != "" {
		return strings.TrimRight(v, "/")
	}
	if v := strings.TrimSpace(env["AUTODEVELOP_ENTITLEMENT_URL"]); v != "" {
		v = strings.TrimRight(v, "/")
		v = strings.TrimSuffix(v, "/entitlement")
		return strings.TrimRight(v, "/")
	}
	if v := strings.TrimSpace(storedHost); v != "" {
		return strings.TrimRight(v, "/")
	}
	return DefaultHost
}

func Join(origin, path string) string {
	return strings.TrimRight(origin, "/") + path
}

func IsRemoteMCPHost(origin string) bool {
	u, err := url.Parse(strings.TrimSpace(origin))
	if err != nil {
		return false
	}
	h := u.Hostname()
	return h != "localhost" && h != "127.0.0.1" && h != "::1"
}

func HostMCPHTTPURL(origin string) string {
	return strings.TrimRight(origin, "/") + "/mcp"
}

func UnreachableMessage(origin string) string {
	target := origin
	if target == "" {
		target = DefaultHost
	}
	if strings.Contains(target, "127.0.0.1") || strings.Contains(target, "localhost") {
		return "Host is not reachable at " + target + ". Start it with pnpm dev."
	}
	return "Autodevelop is not reachable. Check your network and try again."
}

func WrapFetchError(err error, origin string) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	if strings.Contains(strings.ToLower(msg), "connection refused") ||
		strings.Contains(strings.ToLower(msg), "no such host") ||
		strings.Contains(strings.ToLower(msg), "i/o timeout") ||
		strings.Contains(strings.ToLower(msg), "network is unreachable") {
		return errors.New(UnreachableMessage(origin))
	}
	return err
}

func environMap() map[string]string {
	out := map[string]string{}
	for _, e := range os.Environ() {
		k, v, ok := strings.Cut(e, "=")
		if ok {
			out[k] = v
		}
	}
	return out
}
