// Copyright (c) 2026 Devrecated.
// Write Cursor / Claude / opencode MCP configs using the autodevelop binary (not node).
package mcpwrite

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/devrecated/autodevelop-cli/internal/mcpattach"
)

const (
	KitMCPName        = "autodevelop"
	HostMCPName       = "autodevelop-host"
	LegacyHostMCPName = "autodevelop-buckets"
	BinaryName        = "autodevelop"
)

func consumerServers(origin string) map[string]any {
	servers := map[string]any{
		KitMCPName: map[string]any{
			"command": BinaryName,
			"args":    []string{"kit-mcp"},
		},
	}
	if mcpattach.IsRemote(origin) {
		servers[HostMCPName] = map[string]any{
			"url": mcpattach.HTTPURL(origin),
		}
	} else {
		servers[HostMCPName] = map[string]any{
			"command": BinaryName,
			"args":    []string{"mcp"},
		}
	}
	return servers
}

func mergeMCP(existing map[string]any, servers map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range existing {
		out[k] = v
	}
	prev, _ := out["mcpServers"].(map[string]any)
	if prev == nil {
		prev = map[string]any{}
	}
	merged := map[string]any{}
	for k, v := range prev {
		if k == LegacyHostMCPName {
			continue
		}
		merged[k] = v
	}
	for k, v := range servers {
		merged[k] = v
	}
	out["mcpServers"] = merged
	return out
}

func writeJSON(path string, doc map[string]any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	return os.WriteFile(path, raw, 0o644)
}

func readJSON(path string) map[string]any {
	raw, err := os.ReadFile(path)
	if err != nil {
		return map[string]any{}
	}
	var doc map[string]any
	if json.Unmarshal(raw, &doc) != nil || doc == nil {
		return map[string]any{}
	}
	return doc
}

// WriteWorkspaceMCP writes .cursor/mcp.json and mcp.json under root.
func WriteWorkspaceMCP(root, origin string) ([]string, error) {
	servers := consumerServers(origin)
	var wrote []string
	for _, dest := range []string{
		filepath.Join(root, ".cursor", "mcp.json"),
		filepath.Join(root, "mcp.json"),
	} {
		existing := readJSON(dest)
		if err := writeJSON(dest, mergeMCP(existing, servers)); err != nil {
			return wrote, err
		}
		wrote = append(wrote, dest)
	}
	return wrote, nil
}

// WriteClaudeMCP writes project .mcp.json for Claude Code.
func WriteClaudeMCP(root, origin string) (string, error) {
	dest := filepath.Join(root, ".mcp.json")
	existing := readJSON(dest)
	if err := writeJSON(dest, mergeMCP(existing, consumerServers(origin))); err != nil {
		return "", err
	}
	return dest, nil
}

// WriteUserMCP merges autodevelop servers into ~/.cursor/mcp.json.
func WriteUserMCP(origin string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dest := filepath.Join(home, ".cursor", "mcp.json")
	existing := readJSON(dest)
	if err := writeJSON(dest, mergeMCP(existing, consumerServers(origin))); err != nil {
		return "", err
	}
	return dest, nil
}

func isAutodevelopServer(name string) bool {
	return name == KitMCPName || name == HostMCPName || name == LegacyHostMCPName
}

// RepoHasAutodevelop reports whether a workspace MCP file lists Autodevelop servers.
func RepoHasAutodevelop(root string) (present bool, path string) {
	for _, rel := range []string{
		filepath.Join(root, ".cursor", "mcp.json"),
		filepath.Join(root, "mcp.json"),
	} {
		doc := readJSON(rel)
		servers, _ := doc["mcpServers"].(map[string]any)
		if servers == nil {
			continue
		}
		for name := range servers {
			if isAutodevelopServer(name) {
				return true, rel
			}
		}
	}
	return false, ""
}

// UserHasAutodevelop reports whether ~/.cursor/mcp.json lists Autodevelop servers.
func UserHasAutodevelop() bool {
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	doc := readJSON(filepath.Join(home, ".cursor", "mcp.json"))
	servers, _ := doc["mcpServers"].(map[string]any)
	if servers == nil {
		return false
	}
	for name := range servers {
		if isAutodevelopServer(name) {
			return true
		}
	}
	return false
}

// ClearRepoMCP removes Autodevelop servers from workspace MCP files.
// Empty mcpServers objects are left as {} (file kept). Returns cleared paths.
func ClearRepoMCP(root string) ([]string, error) {
	var cleared []string
	for _, dest := range []string{
		filepath.Join(root, ".cursor", "mcp.json"),
		filepath.Join(root, "mcp.json"),
	} {
		if _, err := os.Stat(dest); err != nil {
			continue
		}
		doc := readJSON(dest)
		servers, _ := doc["mcpServers"].(map[string]any)
		if servers == nil {
			continue
		}
		changed := false
		next := map[string]any{}
		for name, v := range servers {
			if isAutodevelopServer(name) {
				changed = true
				continue
			}
			next[name] = v
		}
		if !changed {
			continue
		}
		doc["mcpServers"] = next
		if err := writeJSON(dest, doc); err != nil {
			return cleared, err
		}
		cleared = append(cleared, dest)
	}
	return cleared, nil
}
