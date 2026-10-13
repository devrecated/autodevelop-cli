// Copyright (c) 2026 Devrecated.
package install

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPurgeMacJunkRemovesAppleDouble(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "branch-policy.yaml")
	junk := filepath.Join(dir, "._branch-policy.yaml")
	store := filepath.Join(dir, ".DS_Store")
	if err := os.WriteFile(real, []byte("ok\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(junk, []byte("sidecar"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(store, []byte("store"), 0o644); err != nil {
		t.Fatal(err)
	}
	purgeMacJunk(dir)
	if _, err := os.Stat(junk); !os.IsNotExist(err) {
		t.Fatalf("sidecar remains: %v", err)
	}
	if _, err := os.Stat(store); !os.IsNotExist(err) {
		t.Fatalf(".DS_Store remains: %v", err)
	}
	if _, err := os.Stat(real); err != nil {
		t.Fatal(err)
	}
}

func TestCopyTreeSkipsAppleDouble(t *testing.T) {
	src := t.TempDir()
	dest := filepath.Join(t.TempDir(), "out")
	if err := os.WriteFile(filepath.Join(src, "branch-policy.yaml"), []byte("ok\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "._branch-policy.yaml"), []byte("sidecar"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := copyTree(src, dest); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dest, "._branch-policy.yaml")); !os.IsNotExist(err) {
		t.Fatalf("copied sidecar: %v", err)
	}
	raw, err := os.ReadFile(filepath.Join(dest, "branch-policy.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "ok\n" {
		t.Fatalf("body %q", raw)
	}
}

func TestIsMacJunkName(t *testing.T) {
	if !isMacJunkName("._branch-policy.yaml") || !isMacJunkName(".autodevelop/.policies/._branch-policy.yaml") {
		t.Fatal("expected appledouble dest to be junk")
	}
	if isMacJunkName(".autodevelop/.policies/branch-policy.yaml") {
		t.Fatal("real policy is not junk")
	}
	if !pathHasMacJunk("__MACOSX/branch-policy.yaml") {
		t.Fatal("expected __MACOSX path to be junk")
	}
}
