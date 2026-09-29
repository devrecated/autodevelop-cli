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

func TestBindProjectSelectsProfile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "credentials.json")
	env := map[string]string{}
	hostA := "https://a.test"
	hostB := "https://b.test"
	issued := "2026-09-28T00:00:00Z"
	_ = credentials.WriteFile(path, "ad_a", nil, &issued, &hostA, "acme", env)
	_ = credentials.WriteFile(path, "ad_b", nil, &issued, &hostB, "devrecated", env)
	if err := credentials.BindProject(path, "github.com/acme/app", "acme"); err != nil {
		t.Fatal(err)
	}
	if err := credentials.BindProject(path, "github.com/devrecated/autodevelop", "devrecated"); err != nil {
		t.Fatal(err)
	}
	got, err := credentials.ResolveEffectiveProfile(env, "", path, "github.com/acme/app")
	if err != nil || got != "acme" {
		t.Fatalf("acme project → %q (%v)", got, err)
	}
	got, err = credentials.ResolveEffectiveProfile(env, "", path, "github.com/devrecated/autodevelop")
	if err != nil || got != "devrecated" {
		t.Fatalf("devrecated project → %q (%v)", got, err)
	}
	env["AUTODEVELOP_PROFILE"] = "acme"
	got, err = credentials.ResolveEffectiveProfile(env, "", path, "github.com/devrecated/autodevelop")
	if err != nil || got != "acme" {
		t.Fatalf("env override → %q (%v)", got, err)
	}
}
