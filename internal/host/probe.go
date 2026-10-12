// Copyright (c) 2026 Devrecated.
package host

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/devrecated/autodevelop-cli/internal/version"
)

// ProbeResult is a live check of the Autodevelop host.
type ProbeResult struct {
	Reachable           bool
	Reason              string
	Authorized          bool
	OrgID               string
	OrgName             string
	Via                 string // /ping or /health
	EntitlementStatus   int
}

// Probe prefers GET /ping (thin), falls back to /health for older hosts,
// then GET /entitlement when a token is present.
// A down server is unreachable. A 401/403 still means the server answered.
func Probe(client *http.Client, origin, token string) ProbeResult {
	if client == nil {
		client = &http.Client{Timeout: 4 * time.Second}
	}
	base := strings.TrimRight(strings.TrimSpace(origin), "/")
	if base == "" {
		return ProbeResult{Reason: UnreachableMessage("")}
	}
	via := ""
	var lastErr error
	for _, path := range []string{"/ping", "/health"} {
		req, err := http.NewRequest(http.MethodGet, Join(base, path), nil)
		if err != nil {
			lastErr = err
			if path == "/ping" {
				continue
			}
			return ProbeResult{Reason: WrapFetchError(err, base).Error()}
		}
		setCLIUserAgent(req)
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			if path == "/ping" {
				continue
			}
			return ProbeResult{Reason: WrapFetchError(err, base).Error()}
		}
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		if resp.StatusCode == http.StatusNotFound && path == "/ping" {
			continue
		}
		if resp.StatusCode >= 400 {
			return ProbeResult{Reason: fmt.Sprintf("The server answered HTTP %d.", resp.StatusCode), Via: path}
		}
		via = path
		lastErr = nil
		break
	}
	if via == "" {
		if lastErr != nil {
			return ProbeResult{Reason: WrapFetchError(lastErr, base).Error()}
		}
		return ProbeResult{Reason: UnreachableMessage(base)}
	}
	credential := strings.TrimSpace(token)
	if credential == "" {
		return ProbeResult{Reachable: true, Via: via}
	}
	req, err := http.NewRequest(http.MethodGet, Join(base, "/entitlement"), nil)
	if err != nil {
		return ProbeResult{Reachable: true, Via: via, Reason: "Sign-in check did not complete."}
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+credential)
	setCLIUserAgent(req)
	resp, err := client.Do(req)
	if err != nil {
		return ProbeResult{Reachable: true, Via: via, Reason: "Sign-in check did not complete."}
	}
	defer resp.Body.Close()
	result := ProbeResult{Reachable: true, Via: via, EntitlementStatus: resp.StatusCode}
	if resp.StatusCode >= 400 {
		return result
	}
	var body struct {
		OrgID   string `json:"org_id"`
		OrgName string `json:"org_name"`
	}
	if json.NewDecoder(resp.Body).Decode(&body) != nil {
		result.Authorized = true
		return result
	}
	result.Authorized = true
	result.OrgID = body.OrgID
	result.OrgName = body.OrgName
	return result
}

func setCLIUserAgent(req *http.Request) {
	if req == nil {
		return
	}
	ver := strings.TrimSpace(version.Version)
	if ver == "" {
		ver = "dev"
	}
	// Default Go UA is often blocked or stalled by edge filters; match curl-like identity.
	req.Header.Set("User-Agent", "autodevelop-cli/"+ver)
}

// OrganizationLabel is the org name or id, with " (default)" for the default profile.
func OrganizationLabel(orgName, orgID, profile string) string {
	label := strings.TrimSpace(orgName)
	if label == "" {
		label = strings.TrimSpace(orgID)
	}
	if label == "" {
		return ""
	}
	if profile == "default" {
		return label + " (default)"
	}
	return label
}
