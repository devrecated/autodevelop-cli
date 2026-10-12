// Copyright (c) 2026 Devrecated.
package host

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestProbeFallsBackToHealth(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ping" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()
	result := Probe(srv.Client(), srv.URL, "")
	if !result.Reachable || result.Via != "/health" {
		t.Fatalf("%+v", result)
	}
}

func TestProbeUnreachableSkipsEntitlement(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("request reached a closed server setup")
	}))
	url := srv.URL
	srv.Close()
	result := Probe(&http.Client{Timeout: time.Second}, url, "ad_fixture")
	if result.Reachable {
		t.Fatal("expected unreachable")
	}
	if result.Reason == "" {
		t.Fatal("missing reason")
	}
}

func TestProbeReadsOrgName(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ping" || r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true}`))
			return
		}
		if r.URL.Path != "/entitlement" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer ad_fixture" {
			t.Fatalf("auth %s", r.Header.Get("Authorization"))
		}
		_, _ = w.Write([]byte(`{"org_id":"org-1","org_name":"Acme"}`))
	}))
	defer srv.Close()
	result := Probe(srv.Client(), srv.URL, "ad_fixture")
	if !result.Reachable || !result.Authorized || result.OrgName != "Acme" || result.Via != "/ping" {
		t.Fatalf("%+v", result)
	}
	if OrganizationLabel(result.OrgName, result.OrgID, "default") != "Acme (default)" {
		t.Fatal("default suffix")
	}
	if OrganizationLabel("Acme", "org-1", "client") != "Acme" {
		t.Fatal("non-default")
	}
}
