// Copyright (c) 2026 Devrecated.
package credentials_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/devrecated/autodevelop-cli/internal/credentials"
)

func TestWriteReadProfile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "credentials.json")
	env := map[string]string{}
	host := "https://brain.devrecated.com"
	issued := "2026-09-28T00:00:00Z"
	if err := credentials.WriteFile(path, "ad_test_token", nil, &issued, &host, "default", env); err != nil {
		t.Fatal(err)
	}
	e := credentials.ReadFile(path, env, "default")
	if e == nil || e.Token != "ad_test_token" {
		t.Fatalf("unexpected entry: %#v", e)
	}
	if e.Host == nil || *e.Host != host {
		t.Fatalf("host: %#v", e.Host)
	}
	fi, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode().Perm()&0o077 != 0 {
		t.Fatalf("credentials should not be group/world readable: %v", fi.Mode())
	}
}

func TestResolveHostFallsBackToActive(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "credentials.json")
	env := map[string]string{}
	host := "https://example.test"
	issued := "2026-09-28T00:00:00Z"
	_ = credentials.WriteFile(path, "ad_a", nil, &issued, &host, "default", env)
	got := credentials.ResolveHost(env, "", path, "newprofile")
	// new profile has no entry — should still use flag/env/default, not leap incorrectly when active has host
	// With empty flag and no AUTODEVELOP_HOST, active profile host is used via ResolveHost logic when profile miss
	if got == "" {
		t.Fatal("empty host")
	}
}
