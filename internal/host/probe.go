// Copyright (c) 2026 Devrecated.
package host

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

// ProbeResult is a live check of the Autodevelop host.
type ProbeResult struct {
	Reachable  bool
	Reason     string
	Authorized bool
	OrgID      string
	OrgName    string
}

// Probe calls GET /health, then GET /entitlement when a token is present.
// A down server is unreachable. A 401/403 still means the server answered.
func Probe(client *http.Client, origin, token string) ProbeResult {
	if client == nil {
		client = &http.Client{Timeout: 4 * time.Second}
	}
	base := strings.TrimRight(strings.TrimSpace(origin), "/")
	if base == "" {
		return ProbeResult{Reason: UnreachableMessage("")}
	}
	health, err := client.Get(Join(base, "/health"))
	if err != nil {
		return ProbeResult{Reason: WrapFetchError(err, base).Error()}
	}
	io.Copy(io.Discard, health.Body)
	health.Body.Close()
	if health.StatusCode >= 400 {
		return ProbeResult{Reason: "The server answered HTTP " + health.Status + "."}
	}
	credential := strings.TrimSpace(token)
	if credential == "" {
		return ProbeResult{Reachable: true}
	}
	req, err := http.NewRequest(http.MethodGet, Join(base, "/entitlement"), nil)
	if err != nil {
		return ProbeResult{Reachable: true, Reason: "Sign-in check did not complete."}
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+credential)
	resp, err := client.Do(req)
	if err != nil {
		return ProbeResult{Reachable: true, Reason: "Sign-in check did not complete."}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return ProbeResult{Reachable: true}
	}
	var body struct {
		OrgID   string `json:"org_id"`
		OrgName string `json:"org_name"`
	}
	if json.NewDecoder(resp.Body).Decode(&body) != nil {
		return ProbeResult{Reachable: true, Authorized: true}
	}
	return ProbeResult{
		Reachable:  true,
		Authorized: true,
		OrgID:      body.OrgID,
		OrgName:    body.OrgName,
	}
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
