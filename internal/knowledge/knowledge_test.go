// Copyright (c) 2026 Devrecated.
package knowledge

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestArchivePostsNode(t *testing.T) {
	var method, path, auth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method = r.Method
		path = r.URL.RequestURI()
		auth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"node":{"label":"Ticket 1","archived_at":"2026-09-29T00:00:00Z"}}`)
	}))
	defer srv.Close()
	var out strings.Builder
	err := Run(Options{
		Env:    map[string]string{"AUTODEVELOP_TOKEN": "ad_fixture"},
		Host:   srv.URL,
		Action: "archive",
		Node:   "node-1",
		Org:    "org-1",
		Client: srv.Client(),
		Stdout: &out,
	})
	if err != nil {
		t.Fatal(err)
	}
	if method != http.MethodPost || !strings.Contains(path, "/admin/knowledge/nodes/node-1/archive") {
		t.Fatalf("request %s %s", method, path)
	}
	if !strings.Contains(path, "org_id=org-1") {
		t.Fatal(path)
	}
	if auth != "Bearer ad_fixture" {
		t.Fatal(auth)
	}
	if !strings.Contains(out.String(), "Ticket 1 archived") {
		t.Fatal(out.String())
	}
}

func TestArchiveRequiresNode(t *testing.T) {
	err := Run(Options{
		Env:    map[string]string{"AUTODEVELOP_TOKEN": "ad_fixture"},
		Action: "archive",
	})
	if err == nil || !strings.Contains(err.Error(), "--node") {
		t.Fatal(err)
	}
}
