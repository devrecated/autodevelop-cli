// Copyright (c) 2026 Devrecated.
package hooks_test

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/devrecated/autodevelop-cli/internal/hooks"
)

func runHook(t *testing.T, id, input string) map[string]any {
	t.Helper()
	var out bytes.Buffer
	if err := hooks.Run(id, strings.NewReader(input), &out); err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(out.Bytes(), &doc); err != nil {
		t.Fatalf("json: %v raw=%q", err, out.String())
	}
	return doc
}

func TestGuardShellDeniesForcePush(t *testing.T) {
	doc := runHook(t, "guard-shell", `{"command":"git push --force origin main"}`)
	if doc["permission"] != "deny" {
		t.Fatalf("got %#v", doc)
	}
}

func TestGuardShellAllowsNormal(t *testing.T) {
	doc := runHook(t, "guard-shell", `{"command":"git status"}`)
	if doc["permission"] != "allow" {
		t.Fatalf("got %#v", doc)
	}
}

func TestGuardMailNeedsConfirm(t *testing.T) {
	doc := runHook(t, "guard-stakeholder-mail", `{"command":"node send-stakeholder-mail.mjs"}`)
	if doc["permission"] != "deny" {
		t.Fatalf("got %#v", doc)
	}
}

func TestPackageBoundaries(t *testing.T) {
	in := `{"tool_input":{"path":"services/brain/x.mjs","contents":"import x from '@devrecated/autodevelop-sdk'"}}`
	doc := runHook(t, "guard-package-boundaries", in)
	if doc["permission"] != "deny" {
		t.Fatalf("got %#v", doc)
	}
}
