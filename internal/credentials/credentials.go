// Copyright (c) 2026 Devrecated.
// Machine credentials. Never print token values.
package credentials

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/devrecated/autodevelop-cli/internal/host"
)

const (
	CredentialsMode = 0o600
	DirMode         = 0o700
	DefaultProfile  = "default"
	ProfileNameMax  = 40
)

var profileNameRE = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`)

type Entry struct {
	Token    string  `json:"token"`
	OrgID    *string `json:"org_id"`
	IssuedAt *string `json:"issued_at"`
	Host     *string `json:"host"`
}

type Store struct {
	Active   string            `json:"active"`
	Profiles map[string]*Entry `json:"profiles"`
}

func DefaultPath(env map[string]string) string {
	if env == nil {
		env = map[string]string{}
		for _, e := range os.Environ() {
			k, v, ok := strings.Cut(e, "=")
			if ok {
				env[k] = v
			}
		}
	}
	if v := strings.TrimSpace(env["AUTODEVELOP_CREDENTIALS"]); v != "" {
		return v
	}
	base := strings.TrimSpace(env["XDG_CONFIG_HOME"])
	if base == "" {
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, ".config")
	}
	return filepath.Join(base, "autodevelop", "credentials.json")
}

func AssertProfileName(name string) (string, error) {
	value := strings.TrimSpace(name)
	if value == "" || len(value) > ProfileNameMax || !profileNameRE.MatchString(value) {
		return "", errors.New("Invalid profile name. Use letters, numbers, dot, underscore, or hyphen (max 40 characters).")
	}
	if strings.Contains(value, "..") || strings.Contains(value, "/") || strings.Contains(value, `\`) {
		return "", errors.New("Invalid profile name. Use letters, numbers, dot, underscore, or hyphen (max 40 characters).")
	}
	return value, nil
}

func ResolveProfileName(env map[string]string, profile, active string) (string, error) {
	if env == nil {
		env = map[string]string{}
	}
	if v := strings.TrimSpace(profile); v != "" {
		return AssertProfileName(v)
	}
	if v := strings.TrimSpace(env["AUTODEVELOP_PROFILE"]); v != "" {
		return AssertProfileName(v)
	}
	if v := strings.TrimSpace(active); v != "" {
		return AssertProfileName(v)
	}
	return DefaultProfile, nil
}

func ReadStore(path string) Store {
	empty := Store{Active: DefaultProfile, Profiles: map[string]*Entry{}}
	raw, err := os.ReadFile(path)
	if err != nil {
		return empty
	}
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return empty
	}
	if profilesRaw, ok := data["profiles"].(map[string]any); ok {
		profiles := map[string]*Entry{}
		for name, v := range profilesRaw {
			if e := normalizeEntry(v); e != nil {
				profiles[name] = e
			}
		}
		active, _ := data["active"].(string)
		if strings.TrimSpace(active) == "" {
			active = DefaultProfile
		}
		return Store{Active: active, Profiles: profiles}
	}
	if e := normalizeEntry(data); e != nil {
		return Store{Active: DefaultProfile, Profiles: map[string]*Entry{DefaultProfile: e}}
	}
	return empty
}

func normalizeEntry(v any) *Entry {
	m, ok := v.(map[string]any)
	if !ok {
		return nil
	}
	token, _ := m["token"].(string)
	token = strings.TrimSpace(token)
	if token == "" {
		return nil
	}
	e := &Entry{Token: token}
	if org, ok := m["org_id"].(string); ok && org != "" {
		e.OrgID = &org
	} else if org, ok := m["orgId"].(string); ok && org != "" {
		e.OrgID = &org
	}
	if at, ok := m["issued_at"].(string); ok && at != "" {
		e.IssuedAt = &at
	} else if at, ok := m["issuedAt"].(string); ok && at != "" {
		e.IssuedAt = &at
	}
	if h, ok := m["host"].(string); ok && h != "" {
		e.Host = &h
	}
	return e
}

func writeStore(path string, store Store) error {
	if store.Profiles == nil {
		store.Profiles = map[string]*Entry{}
	}
	if store.Active == "" {
		store.Active = DefaultProfile
	}
	if err := os.MkdirAll(filepath.Dir(path), DirMode); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	if err := os.WriteFile(path, raw, CredentialsMode); err != nil {
		return err
	}
	return os.Chmod(path, CredentialsMode)
}

func ReadFile(path string, env map[string]string, profile string) *Entry {
	store := ReadStore(path)
	name, err := ResolveProfileName(env, profile, store.Active)
	if err != nil {
		if strings.TrimSpace(profile) != "" || strings.TrimSpace(env["AUTODEVELOP_PROFILE"]) != "" {
			return nil
		}
		name = DefaultProfile
		if store.Profiles[name] == nil {
			for k := range store.Profiles {
				name = k
				break
			}
		}
	}
	return store.Profiles[name]
}

func WriteFile(path string, token string, orgID *string, issuedAt *string, hostVal *string, profile string, env map[string]string) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return errors.New("Refusing to write empty credentials.")
	}
	name, err := ResolveProfileName(env, profile, "")
	if err != nil {
		return err
	}
	store := ReadStore(path)
	if store.Profiles == nil {
		store.Profiles = map[string]*Entry{}
	}
	store.Profiles[name] = &Entry{
		Token:    token,
		OrgID:    orgID,
		IssuedAt: issuedAt,
		Host:     hostVal,
	}
	store.Active = name
	return writeStore(path, store)
}

func ClearFile(path string) error {
	if path == "" {
		return nil
	}
	if _, err := os.Stat(path); err != nil {
		return nil
	}
	return os.Remove(path)
}

func ClearProfile(path, name string, env map[string]string) (empty bool, active, removed string, err error) {
	store := ReadStore(path)
	target, err := ResolveProfileName(env, name, store.Active)
	if err != nil {
		return false, "", "", err
	}
	delete(store.Profiles, target)
	if len(store.Profiles) == 0 {
		_ = ClearFile(path)
		return true, "", target, nil
	}
	active = store.Active
	if active == target {
		for k := range store.Profiles {
			active = k
			break
		}
	}
	store.Active = active
	if err := writeStore(path, store); err != nil {
		return false, "", "", err
	}
	return false, active, target, nil
}

func SetActive(path, name string) (string, error) {
	profile, err := AssertProfileName(name)
	if err != nil {
		return "", err
	}
	store := ReadStore(path)
	if store.Profiles[profile] == nil {
		return "", fmt.Errorf("Unknown profile: %s", profile)
	}
	store.Active = profile
	return profile, writeStore(path, store)
}

type ProfileSummary struct {
	Name   string  `json:"name"`
	Active bool    `json:"active"`
	Host   *string `json:"host"`
	OrgID  *string `json:"org_id"`
}

func ListSummaries(path string, env map[string]string) []ProfileSummary {
	store := ReadStore(path)
	active := store.Active
	if a, err := ResolveProfileName(env, "", store.Active); err == nil {
		active = a
	}
	out := make([]ProfileSummary, 0, len(store.Profiles))
	for name, e := range store.Profiles {
		out = append(out, ProfileSummary{
			Name:   name,
			Active: name == active,
			Host:   e.Host,
			OrgID:  e.OrgID,
		})
	}
	return out
}

func ReadToken(env map[string]string, credentialsPath, profile string) string {
	if env == nil {
		env = map[string]string{}
		for _, e := range os.Environ() {
			k, v, ok := strings.Cut(e, "=")
			if ok {
				env[k] = v
			}
		}
	}
	if v := strings.TrimSpace(env["AUTODEVELOP_TOKEN"]); v != "" {
		return v
	}
	path := credentialsPath
	if path == "" {
		path = DefaultPath(env)
	}
	if e := ReadFile(path, env, profile); e != nil && e.Token != "" {
		return e.Token
	}
	return strings.TrimSpace(env["TOKEN"])
}

func TokenSource(env map[string]string, credentialsPath, profile string) string {
	if strings.TrimSpace(env["AUTODEVELOP_TOKEN"]) != "" {
		return "AUTODEVELOP_TOKEN"
	}
	path := credentialsPath
	if path == "" {
		path = DefaultPath(env)
	}
	if ReadFile(path, env, profile) != nil {
		return "credentials"
	}
	if strings.TrimSpace(env["TOKEN"]) != "" {
		return "TOKEN"
	}
	return ""
}

func ResolveHost(env map[string]string, hostFlag, credentialsPath, profile string) string {
	path := credentialsPath
	if path == "" {
		path = DefaultPath(env)
	}
	stored := ReadFile(path, env, profile)
	var storedHost string
	if stored != nil && stored.Host != nil {
		storedHost = *stored.Host
	}
	if storedHost != "" {
		return host.Origin(env, hostFlag, storedHost)
	}
	store := ReadStore(path)
	activeName := strings.TrimSpace(store.Active)
	if activeName == "" {
		activeName = DefaultProfile
	}
	if e := store.Profiles[activeName]; e != nil && e.Host != nil {
		return host.Origin(env, hostFlag, *e.Host)
	}
	return host.Origin(env, hostFlag, "")
}
