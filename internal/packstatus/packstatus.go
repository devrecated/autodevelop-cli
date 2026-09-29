// Copyright (c) 2026 Devrecated.
package packstatus

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/devrecated/autodevelop-cli/internal/host"
)

func ReadLocalVersion(root, slug string) string {
	slug = strings.TrimSpace(strings.ToLower(slug))
	if root == "" || slug == "" || slug == "autodevelop" || slug == "third-party" {
		return ""
	}
	candidates := []string{
		filepath.Join(root, ".autodevelop", ".policies", "VERSION"),
		filepath.Join(root, ".cursor", "skills", slug, "autodevelop", ".policies", "VERSION"),
	}
	for _, path := range candidates {
		raw, err := os.ReadFile(path)
		if err == nil {
			return strings.TrimSpace(string(raw))
		}
	}
	return ""
}

func InferSlug(root, requested string) string {
	name := strings.TrimSpace(strings.ToLower(requested))
	if name != "" && name != "autodevelop" && name != "third-party" {
		return name
	}
	skills := filepath.Join(root, ".cursor", "skills")
	entries, err := os.ReadDir(skills)
	if err != nil {
		return ""
	}
	var names []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if entry.Name() == "autodevelop" || entry.Name() == "third-party" {
			continue
		}
		names = append(names, entry.Name())
	}
	for _, name := range names {
		if name == "devrecated" {
			return name
		}
	}
	if len(names) > 0 {
		return names[0]
	}
	return ""
}

type Result struct {
	HostedVersion string `json:"hostedVersion"`
	Compatible    *bool  `json:"compatible"`
}

func Fetch(client *http.Client, origin, credential, slug, localVersion string) (Result, error) {
	if client == nil {
		client = http.DefaultClient
	}
	query := url.Values{}
	if slug != "" {
		query.Set("slug", slug)
	}
	if localVersion != "" {
		query.Set("local", localVersion)
	}
	path := "/cli/pack/status"
	if encoded := query.Encode(); encoded != "" {
		path += "?" + encoded
	}
	req, err := http.NewRequest(http.MethodGet, host.Join(origin, path), nil)
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+credential)
	resp, err := client.Do(req)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()
	var result Result
	if json.NewDecoder(resp.Body).Decode(&result) != nil || resp.StatusCode >= 400 {
		return Result{}, errStatus
	}
	return result, nil
}

var errStatus = errString("pack status failed")

type errString string

func (e errString) Error() string { return string(e) }
