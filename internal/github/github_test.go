// Copyright (c) 2026 Devrecated.
package github

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestTokenDefaultsToPrimaryAndOmitsSecret(t *testing.T) {
	var seen string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.URL.RequestURI()
		if r.Header.Get("Authorization") != "Bearer ad_fixture" {
			t.Fatalf("auth header")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"token":"ghs_secret","expires_at":"2026-08-31T12:00:00Z","account":"adamsiwiec1"}`)
	}))
	defer srv.Close()
	var out strings.Builder
	err := Run(Options{
		Env:     map[string]string{"AUTODEVELOP_TOKEN": "ad_fixture"},
		Host:    srv.URL,
		Command: "token",
		Client:  srv.Client(),
		Stdout:  &out,
	})
	if err != nil {
		t.Fatal(err)
	}
	if seen != "/cli/github/token" {
		t.Fatalf("path %s", seen)
	}
	if strings.Contains(out.String(), "ghs_secret") {
		t.Fatal("printed token")
	}
	if !strings.Contains(out.String(), "adamsiwiec1") {
		t.Fatal(out.String())
	}
}

func TestTokenAccountQuery(t *testing.T) {
	var seen string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.URL.RequestURI()
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"expires_at":"2026-08-31T12:00:00Z","account":"devrecated","token":"ghs_secret"}`)
	}))
	defer srv.Close()
	var out strings.Builder
	err := Run(Options{
		Env:     map[string]string{"AUTODEVELOP_TOKEN": "ad_fixture"},
		Host:    srv.URL,
		Command: "token",
		Account: "devrecated",
		Client:  srv.Client(),
		Stdout:  &out,
	})
	if err != nil {
		t.Fatal(err)
	}
	if seen != "/cli/github/token?account=devrecated" {
		t.Fatalf("path %s", seen)
	}
	if strings.Contains(out.String(), "ghs_secret") {
		t.Fatal("printed token")
	}
}

func TestStatusListsPrimaryWithoutPrompt(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"connected":true,"account":"adamsiwiec1","accounts":[{"login":"adamsiwiec1","primary":true},{"login":"devrecated","primary":false}]}`)
	}))
	defer srv.Close()
	var out strings.Builder
	err := Run(Options{
		Env:     map[string]string{"AUTODEVELOP_TOKEN": "ad_fixture"},
		Host:    srv.URL,
		Command: "status",
		Client:  srv.Client(),
		Stdout:  &out,
	})
	if err != nil {
		t.Fatal(err)
	}
	text := out.String()
	if !strings.Contains(text, "primary is adamsiwiec1") || !strings.Contains(text, "devrecated") {
		t.Fatal(text)
	}
	if strings.Contains(strings.ToLower(text), "choose") || strings.Contains(strings.ToLower(text), "prompt") {
		t.Fatal(text)
	}
}

func TestInitStopsWhenAlreadyConnected(t *testing.T) {
	now := time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"connected":true,"account":"adamsiwiec1"}`)
	}))
	defer srv.Close()
	var out strings.Builder
	err := Run(Options{
		Env:     map[string]string{"AUTODEVELOP_TOKEN": "ad_fixture"},
		Host:    srv.URL,
		Command: "init",
		Client:  srv.Client(),
		Stdout:  &out,
		Now:     func() time.Time { return now },
		Sleep:   func(time.Duration) {},
		Open:    func(string) error { t.Fatal("opened browser"); return nil },
	})
	if err != nil {
		t.Fatal(err)
	}
}
