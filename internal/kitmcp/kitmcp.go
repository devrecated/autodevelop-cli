// Copyright (c) 2026 Devrecated.
// Read-only kit MCP over stdio (kit_doctor, kit_config, kit_session, kit_people, kit_git).
package kitmcp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const protocolVersion = "2024-11-05"

var serverInfo = map[string]any{"name": "autodevelop", "version": "1.0.0"}

const workspaceRootRequired = "workspace_root is required (the consumer git/app root). User-scope plugin cwd is the plugin, not the workspace."

func toolDefinitions() []map[string]any {
	ws := map[string]any{
		"type":        "string",
		"description": "Consumer repository root (absolute path).",
	}
	props := map[string]any{"workspace_root": ws}
	req := []string{"workspace_root"}
	schema := map[string]any{"type": "object", "properties": props, "required": req}
	names := []string{"kit_doctor", "kit_config", "kit_session", "kit_people", "kit_git"}
	out := make([]map[string]any, 0, len(names))
	for _, n := range names {
		out = append(out, map[string]any{
			"name":        n,
			"description": "Autodevelop kit tool: " + n,
			"inputSchema": schema,
		})
	}
	return out
}

func resolveWorkspaceRoot(args map[string]any) (string, error) {
	raw, _ := args["workspace_root"].(string)
	if raw == "" {
		raw, _ = args["workspaceRoot"].(string)
	}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("%s", workspaceRootRequired)
	}
	return filepath.Clean(raw), nil
}

func git(root string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = root
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func callTool(name string, args map[string]any) (any, error) {
	root, err := resolveWorkspaceRoot(args)
	if err != nil {
		return nil, err
	}
	switch name {
	case "kit_doctor":
		return kitDoctor(root)
	case "kit_config":
		return kitConfig(root)
	case "kit_session":
		return kitSession(root)
	case "kit_people":
		return kitPeople(root)
	case "kit_git":
		return kitGit(root)
	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}

func kitDoctor(root string) (any, error) {
	checks := []map[string]any{}
	ok := true
	add := func(name string, pass bool, detail string) {
		checks = append(checks, map[string]any{"name": name, "ok": pass, "detail": detail})
		if !pass {
			ok = false
		}
	}
	if _, err := os.Stat(filepath.Join(root, ".git")); err == nil {
		add("git", true, "repository present")
	} else {
		add("git", false, ".git missing")
	}
	if _, err := os.Stat(filepath.Join(root, ".cursor")); err == nil {
		add("cursor_kit", true, ".cursor present")
	} else {
		add("cursor_kit", false, ".cursor missing — run autodevelop login")
	}
	if _, err := os.Stat(filepath.Join(root, ".cursor", "mcp.json")); err == nil {
		add("mcp", true, ".cursor/mcp.json present")
	} else {
		add("mcp", false, ".cursor/mcp.json missing")
	}
	hard := []string{}
	for _, c := range checks {
		if c["ok"] == false {
			hard = append(hard, c["detail"].(string))
		}
	}
	return map[string]any{"ok": ok, "bound": ok, "hardFails": hard, "checks": checks}, nil
}

func kitConfig(root string) (any, error) {
	candidates := []string{
		filepath.Join(root, ".cursor", "skills"),
	}
	_ = candidates
	return map[string]any{
		"source":   "workspace",
		"instance": nil,
		"board":    map[string]any{"provider": "github"},
		"root":     root,
	}, nil
}

func kitSession(root string) (any, error) {
	path := filepath.Join(root, ".cursor", "local", "gh-projects", "session.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		return map[string]any{"bound": false, "path": path}, nil
	}
	var doc any
	if json.Unmarshal(raw, &doc) != nil {
		return map[string]any{"bound": false, "path": path, "error": "invalid json"}, nil
	}
	return map[string]any{"bound": true, "path": path, "session": doc}, nil
}

func kitPeople(root string) (any, error) {
	return map[string]any{"people": []any{}, "root": root}, nil
}

func kitGit(root string) (any, error) {
	branch, _ := git(root, "rev-parse", "--abbrev-ref", "HEAD")
	sha, _ := git(root, "rev-parse", "--short", "HEAD")
	status, _ := git(root, "status", "--porcelain")
	return map[string]any{
		"branch": branch,
		"sha":    sha,
		"dirty":  strings.TrimSpace(status) != "",
		"status": status,
		"root":   root,
	}, nil
}

func writeMessage(w io.Writer, message map[string]any) {
	raw, _ := json.Marshal(message)
	fmt.Fprintf(w, "%s\n", raw)
}

func ok(w io.Writer, id any, result any) {
	writeMessage(w, map[string]any{"jsonrpc": "2.0", "id": id, "result": result})
}

func fail(w io.Writer, id any, code int, message string) {
	writeMessage(w, map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"error":   map[string]any{"code": code, "message": message},
	})
}

func handle(w io.Writer, message map[string]any) {
	id := message["id"]
	if id == nil {
		return
	}
	method, _ := message["method"].(string)
	params, _ := message["params"].(map[string]any)
	switch method {
	case "initialize":
		pv := protocolVersion
		if params != nil {
			if v, ok := params["protocolVersion"].(string); ok && v != "" {
				pv = v
			}
		}
		ok(w, id, map[string]any{
			"protocolVersion": pv,
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      serverInfo,
		})
	case "ping":
		ok(w, id, map[string]any{})
	case "tools/list":
		ok(w, id, map[string]any{"tools": toolDefinitions()})
	case "tools/call":
		name, _ := params["name"].(string)
		args, _ := params["arguments"].(map[string]any)
		if args == nil {
			args = map[string]any{}
		}
		result, err := callTool(name, args)
		if err != nil {
			ok(w, id, map[string]any{
				"content": []any{map[string]any{"type": "text", "text": err.Error()}},
				"isError": true,
			})
			return
		}
		raw, _ := json.Marshal(result)
		ok(w, id, map[string]any{
			"content": []any{map[string]any{"type": "text", "text": string(raw)}},
		})
	default:
		fail(w, id, -32601, "Method not found: "+method)
	}
}

func Run(stdin io.Reader, stdout io.Writer) error {
	if stdin == nil {
		stdin = os.Stdin
	}
	if stdout == nil {
		stdout = os.Stdout
	}
	sc := bufio.NewScanner(stdin)
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, 10*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var message map[string]any
		if json.Unmarshal([]byte(line), &message) != nil {
			continue
		}
		handle(stdout, message)
	}
	return sc.Err()
}
