// Copyright (c) 2026 Devrecated.
package connect

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/devrecated/autodevelop-cli/internal/credentials"
)

func writeCreds(t *testing.T, dir, profile, hostURL, token string) string {
	t.Helper()
	path := filepath.Join(dir, "credentials.json")
	store := credentials.Store{
		Active: profile,
		Profiles: map[string]*credentials.Entry{
			profile: {
				Token: token,
				Host:  &hostURL,
			},
		},
	}
	raw, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(raw, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestBuildDualMCP(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ping", "/health":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true}`))
		case "/entitlement":
			_, _ = w.Write([]byte(`{"org_id":"o1","org_name":"Acme"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	root := t.TempDir()
	credPath := writeCreds(t, root, "default", srv.URL, "ad_fixture")
	mcpDir := filepath.Join(root, ".cursor")
	if err := os.MkdirAll(mcpDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(mcpDir, "mcp.json"), []byte(`{"mcpServers":{"autodevelop-host":{"url":"http://127.0.0.1:9/mcp"}}}`+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	home := t.TempDir()
	userCursor := filepath.Join(home, ".cursor")
	if err := os.MkdirAll(userCursor, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(userCursor, "mcp.json"), []byte(`{"mcpServers":{"autodevelop":{"command":"autodevelop","args":["kit-mcp"]},"autodevelop-host":{"url":"`+srv.URL+`/mcp"}}}`+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))

	diag := Build(Options{
		Env:             map[string]string{},
		Cwd:             root,
		CredentialsPath: credPath,
		Client:          &http.Client{Timeout: time.Second},
	})
	if diag.OK || diag.Class != "dual_mcp" || !diag.Autofix.Available {
		t.Fatalf("%+v", diag)
	}

	result := Apply(Options{
		Env:             map[string]string{},
		Cwd:             root,
		CredentialsPath: credPath,
		Client:          &http.Client{Timeout: time.Second},
	})
	if !result.OK {
		t.Fatalf("autofix failed: %+v err=%s", result.Diagnose, result.Error)
	}
	raw, _ := os.ReadFile(filepath.Join(mcpDir, "mcp.json"))
	if strings.Contains(string(raw), "autodevelop-host") {
		t.Fatalf("repo mcp still has autodevelop: %s", raw)
	}
}

func TestBuildNotSignedIn(t *testing.T) {
	root := t.TempDir()
	home := t.TempDir()
	t.Setenv("HOME", home)
	diag := Build(Options{
		Env:             map[string]string{},
		Cwd:             root,
		CredentialsPath: filepath.Join(root, "missing.json"),
		Client:          &http.Client{Timeout: 200 * time.Millisecond},
	})
	if diag.OK || diag.Class != "not_signed_in" {
		t.Fatalf("%+v", diag)
	}
	chat := FormatChat(diag)
	if !strings.Contains(chat, "not signed in") {
		t.Fatal(chat)
	}
}

func TestProbePingPreferred(t *testing.T) {
	pingHits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ping" {
			pingHits++
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true}`))
			return
		}
		if r.URL.Path == "/health" {
			t.Fatal("should not hit /health when /ping works")
		}
		if r.URL.Path == "/entitlement" {
			_, _ = w.Write([]byte(`{"org_id":"o1","org_name":"Acme"}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	root := t.TempDir()
	credPath := writeCreds(t, root, "default", srv.URL, "ad_fixture")
	home := t.TempDir()
	userCursor := filepath.Join(home, ".cursor")
	_ = os.MkdirAll(userCursor, 0o755)
	_ = os.WriteFile(filepath.Join(userCursor, "mcp.json"), []byte(`{"mcpServers":{"autodevelop":{"command":"x"},"autodevelop-host":{"url":"https://brain.devrecated.com/mcp"}}}`+"\n"), 0o644)
	t.Setenv("HOME", home)

	diag := Build(Options{
		Env:             map[string]string{},
		Cwd:             root,
		CredentialsPath: credPath,
		Client:          &http.Client{Timeout: time.Second},
	})
	if !diag.OK {
		t.Fatalf("%+v", diag)
	}
	if pingHits < 1 {
		t.Fatal("expected /ping")
	}
}
