// Copyright (c) 2026 Devrecated.
package skillcleanup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestBuildSkipsConsumerRepos(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, ".cursor", "commands", "ui--implement.md"), "cmd")
	plan, err := Build(root, time.Date(2026, 10, 13, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Moves) != 0 {
		t.Fatalf("consumer repo should not archive, got %#v", plan.Moves)
	}
}

func TestBuildListsKitDuplicatesAndKeepsLocal(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "kits", "cursor", "commands", "ui--implement.md"), "kit")
	writeFile(t, filepath.Join(root, "kits", "cursor", "skills", "autodevelop", "implement", "SKILL.md"), "kit")
	writeFile(t, filepath.Join(root, ".cursor", "commands", "ui--implement.md"), "repo")
	writeFile(t, filepath.Join(root, ".cursor", "commands", "global-create-autodevelop-skill.md"), "staff")
	writeFile(t, filepath.Join(root, ".cursor", "skills", "autodevelop", "implement", "SKILL.md"), "repo")
	writeFile(t, filepath.Join(root, ".cursor", "skills", "autodevelop-internal", "process", "SKILL.md"), "staff")
	writeFile(t, filepath.Join(root, ".cursor", "skills", "optic-truck-works", "local", "SKILL.md"), "client")

	plan, err := Build(root, time.Date(2026, 10, 13, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	text := Format(plan)
	if !strings.Contains(text, ".cursor/commands/ui--implement.md") {
		t.Fatal(text)
	}
	if !strings.Contains(text, ".cursor/skills/autodevelop/") {
		t.Fatal(text)
	}
	if !strings.Contains(text, ".autodevelop/archive/20261013T100000Z/") {
		t.Fatal(text)
	}
	if strings.Contains(text, "global-create") && !strings.Contains(text, "Staying in the repo") {
		t.Fatal(text)
	}
	for _, rel := range plan.Keep {
		if strings.Contains(rel, "ui--implement") || rel == ".cursor/skills/autodevelop/" {
			t.Fatalf("keep listed a duplicate: %s", rel)
		}
	}
	joined := strings.Join(plan.Keep, "\n")
	if !strings.Contains(joined, "global-create-autodevelop-skill.md") {
		t.Fatal(joined)
	}
	if !strings.Contains(joined, "autodevelop-internal/") || !strings.Contains(joined, "optic-truck-works/") {
		t.Fatal(joined)
	}
}

func TestOfferYesArchivesAndNoLeaves(t *testing.T) {
	now := time.Date(2026, 10, 13, 10, 0, 0, 0, time.UTC)
	root := t.TempDir()
	cmd := filepath.Join(root, ".cursor", "commands", "ui--implement.md")
	skill := filepath.Join(root, ".cursor", "skills", "autodevelop", "implement", "SKILL.md")
	staff := filepath.Join(root, ".cursor", "commands", "global-create-autodevelop-skill.md")
	writeFile(t, filepath.Join(root, "kits", "cursor", "commands", "ui--implement.md"), "kit")
	writeFile(t, filepath.Join(root, "kits", "cursor", "skills", "autodevelop", "implement", "SKILL.md"), "kit")
	writeFile(t, cmd, "repo-cmd")
	writeFile(t, skill, "repo-skill")
	writeFile(t, staff, "staff")

	var out strings.Builder
	if err := Offer(root, strings.NewReader("n\n"), &out, now); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(cmd); err != nil {
		t.Fatal("no should leave the command")
	}
	if !strings.Contains(out.String(), "Left repo copies in place.") {
		t.Fatal(out.String())
	}

	out.Reset()
	if err := Offer(root, strings.NewReader("y\n"), &out, now); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(cmd); !os.IsNotExist(err) {
		t.Fatal("command should have moved")
	}
	if _, err := os.Stat(skill); !os.IsNotExist(err) {
		t.Fatal("skill tree should have moved")
	}
	archivedCmd := filepath.Join(root, ".autodevelop", "archive", "20261013T100000Z", "commands", "ui--implement.md")
	body, err := os.ReadFile(archivedCmd)
	if err != nil || string(body) != "repo-cmd" {
		t.Fatal(err, string(body))
	}
	if _, err := os.Stat(staff); err != nil {
		t.Fatal("staff command should stay")
	}
	if !strings.Contains(out.String(), "Archived 2 paths") {
		t.Fatal(out.String())
	}
}
