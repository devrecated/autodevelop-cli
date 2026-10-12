// Copyright (c) 2026 Devrecated.
// Structured Autodevelop connection diagnose for `autodevelop connect [--fix]`.
// Never includes token values.
package connect

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/devrecated/autodevelop-cli/internal/credentials"
	"github.com/devrecated/autodevelop-cli/internal/host"
	"github.com/devrecated/autodevelop-cli/internal/mcpattach"
	"github.com/devrecated/autodevelop-cli/internal/mcpwrite"
)

const (
	ReachTimeoutMS       = 800
	EntitlementTimeoutMS = 2000
)

// Autofix describes a safe repair the CLI can apply without a browser.
type Autofix struct {
	Available    bool     `json:"available"`
	Summary      string   `json:"summary,omitempty"`
	Commands     []string `json:"commands,omitempty"`
	NeedsReload  bool     `json:"needs_reload"`
	NeedsBrowser bool     `json:"needs_browser"`
	Profile      string   `json:"profile,omitempty"`
}

// Diagnose is the structured connection check result.
type Diagnose struct {
	OK          bool     `json:"ok"`
	Class       string   `json:"class"`
	WhatIsWrong string   `json:"what_is_wrong,omitempty"`
	Steps       []string `json:"steps"`
	Commands    []string `json:"commands"`
	Autofix     Autofix  `json:"autofix"`
	Host        string   `json:"host,omitempty"`
	Profile     string   `json:"profile,omitempty"`
	OrgName     string   `json:"org_name,omitempty"`
	OrgID       string   `json:"org_id,omitempty"`
	DualMCP     bool     `json:"dual_mcp,omitempty"`
	UserMCP     bool     `json:"user_mcp,omitempty"`
}

// Options configures diagnose / autofix.
type Options struct {
	Env             map[string]string
	Cwd             string
	CredentialsPath string
	Profile         string
	Host            string
	Client          *http.Client
}

func cliPrefix() string {
	return "autodevelop"
}

func findHostedProfile(summaries []credentials.ProfileSummary) *credentials.ProfileSummary {
	for i := range summaries {
		row := &summaries[i]
		if row.Host != nil && mcpattach.IsRemote(*row.Host) {
			return row
		}
	}
	return nil
}

func activeName(summaries []credentials.ProfileSummary) string {
	for _, row := range summaries {
		if row.Active {
			return row.Name
		}
	}
	return ""
}

func probeClient(ms int) *http.Client {
	if ms < 200 {
		ms = 200
	}
	return &http.Client{Timeout: time.Duration(ms) * time.Millisecond}
}

// Build runs the connection diagnose (no side effects).
func Build(opts Options) Diagnose {
	env := opts.Env
	if env == nil {
		env = map[string]string{}
	}
	cwd := opts.Cwd
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	path := opts.CredentialsPath
	if path == "" {
		path = credentials.DefaultPath(env)
	}
	prefix := cliPrefix()
	summaries := credentials.ListSummaries(path, env)
	active, _ := credentials.ResolveEffectiveProfile(env, opts.Profile, path, "")
	if opts.Profile != "" {
		active = opts.Profile
	}
	stored := credentials.ReadFile(path, env, active)
	origin := credentials.ResolveHost(env, opts.Host, path, active)
	signedIn := credentials.TokenSource(env, path, active) != ""
	userHasMCP := mcpwrite.UserHasAutodevelop()
	repoPresent, _ := mcpwrite.RepoHasAutodevelop(cwd)
	token := credentials.ReadToken(env, path, active)

	client := opts.Client
	if client == nil {
		client = probeClient(ReachTimeoutMS)
	}
	reach := host.Probe(client, origin, "")
	// Entitlement with its own budget when reachable and signed in.
	var authorized *bool
	orgName := ""
	orgID := ""
	entStatus := 0
	if stored != nil && stored.OrgID != nil {
		orgID = *stored.OrgID
	}
	if reach.Reachable && signedIn {
		entClient := opts.Client
		if entClient == nil {
			entClient = probeClient(EntitlementTimeoutMS)
		}
		probe := host.Probe(entClient, origin, token)
		reach.Reachable = probe.Reachable
		reach.Via = probe.Via
		if probe.Reason != "" && !probe.Reachable {
			reach.Reason = probe.Reason
		}
		entStatus = probe.EntitlementStatus
		auth := probe.Authorized
		authorized = &auth
		if probe.OrgName != "" {
			orgName = probe.OrgName
		}
		if probe.OrgID != "" {
			orgID = probe.OrgID
		}
	}

	hosted := findHostedProfile(summaries)
	loopback := !mcpattach.IsRemote(origin) && origin != ""
	profileName := activeName(summaries)
	if active != "" {
		profileName = active
	}

	emptyAutofix := Autofix{}

	if entStatus == http.StatusForbidden {
		return Diagnose{
			OK:          false,
			Class:       "billing_expired",
			WhatIsWrong: "The Autodevelop host rejected this sign-in (billing or token expired).",
			Steps: []string{
				"Ask an operator to renew the subscription or issue a new sign-in.",
				"Then run login again and reload Cursor.",
			},
			Commands: []string{fmt.Sprintf("%s login --host %s", prefix, origin), fmt.Sprintf("%s status", prefix)},
			Autofix:  Autofix{NeedsBrowser: true},
			Host:     origin,
			Profile:  profileName,
			OrgName:  orgName,
			OrgID:    orgID,
		}
	}

	if !signedIn {
		hostFlag := host.DefaultHost
		if hosted != nil && hosted.Host != nil {
			hostFlag = *hosted.Host
		}
		return Diagnose{
			OK:          false,
			Class:       "not_signed_in",
			WhatIsWrong: "This machine is not signed in to Autodevelop.",
			Steps: []string{
				"Run login (browser approve if asked).",
				"Reload the Cursor window so Autodevelop tools attach.",
			},
			Commands: []string{fmt.Sprintf("%s login --host %s", prefix, hostFlag), fmt.Sprintf("%s status", prefix)},
			Autofix:  Autofix{NeedsReload: true, NeedsBrowser: true},
			Host:     origin,
		}
	}

	if !reach.Reachable && loopback {
		steps := []string{
			fmt.Sprintf("Signed in to local host %s, but that process is not running.", origin),
		}
		var commands []string
		autofix := emptyAutofix
		if hosted != nil {
			steps = append(steps,
				fmt.Sprintf("A hosted profile (%s → %s) is already on this machine — prefer that for Cursor.", hosted.Name, deref(hosted.Host)),
				"Reload Cursor after MCP is rewritten.",
			)
			cmd := fmt.Sprintf("%s connect --fix --profile %s", prefix, hosted.Name)
			commands = []string{cmd, fmt.Sprintf("%s status", prefix), "# Or keep local dogfood:", "pnpm dev", fmt.Sprintf("curl -m 1 %s/health", origin)}
			autofix = Autofix{
				Available:   true,
				Summary:     fmt.Sprintf("Switch to hosted profile %s, rewrite Cursor MCP, clear repo Autodevelop MCP.", hosted.Name),
				Commands:    []string{cmd},
				NeedsReload: true,
				Profile:     hosted.Name,
			}
		} else {
			steps = append(steps,
				"No hosted profile is stored yet — either start local brain or login to the hosted host.",
				"Reload Cursor after MCP is rewritten.",
			)
			commands = []string{
				fmt.Sprintf("%s login --host %s --profile hosted", prefix, host.DefaultHost),
				fmt.Sprintf("%s status", prefix),
				"# Or keep local dogfood:",
				"pnpm dev",
				fmt.Sprintf("curl -m 1 %s/health", origin),
			}
			autofix = Autofix{NeedsReload: true, NeedsBrowser: true}
		}
		return Diagnose{
			OK:          false,
			Class:       "host_unreachable_loopback",
			WhatIsWrong: fmt.Sprintf("Local Autodevelop host %s is not reachable.", origin),
			Steps:       steps,
			Commands:    commands,
			Autofix:     autofix,
			Host:        origin,
			Profile:     profileName,
			OrgName:     orgName,
			OrgID:       orgID,
			DualMCP:     repoPresent,
			UserMCP:     userHasMCP,
		}
	}

	if !reach.Reachable {
		return Diagnose{
			OK:          false,
			Class:       "host_unreachable_remote",
			WhatIsWrong: fmt.Sprintf("Hosted Autodevelop at %s is not reachable.", origin),
			Steps: []string{
				"Check network / VPN.",
				"Confirm the host URL, then retry status.",
				"If the host moved, login with the new --host.",
			},
			Commands: []string{fmt.Sprintf("%s status", prefix), fmt.Sprintf("%s login --host %s", prefix, origin)},
			Autofix:  emptyAutofix,
			Host:     origin,
			Profile:  profileName,
			OrgName:  orgName,
			OrgID:    orgID,
		}
	}

	if signedIn && authorized != nil && !*authorized {
		return Diagnose{
			OK:          false,
			Class:       "unauthorized",
			WhatIsWrong: "Signed in on this machine, but the server did not accept the credential.",
			Steps: []string{
				"Run login again to refresh the token.",
				"Reload Cursor and Authenticate the host tool if asked.",
			},
			Commands: []string{fmt.Sprintf("%s login --host %s", prefix, origin), fmt.Sprintf("%s status", prefix)},
			Autofix:  Autofix{NeedsReload: true, NeedsBrowser: true},
			Host:     origin,
			Profile:  profileName,
			OrgName:  orgName,
			OrgID:    orgID,
		}
	}

	if repoPresent {
		return Diagnose{
			OK: false,
			Class: "dual_mcp",
			WhatIsWrong: "Autodevelop MCP is also listed in this repo’s .cursor/mcp.json, which can start a second (often stale) host.",
			Steps: []string{
				"Clear Autodevelop servers from the repo MCP file (user-global MCP is the supported path).",
				"Reload Cursor.",
			},
			Commands: []string{fmt.Sprintf("%s connect --fix", prefix), fmt.Sprintf("%s status", prefix)},
			Autofix: Autofix{
				Available:   true,
				Summary:     "Clear Autodevelop entries from repo MCP and refresh user MCP.",
				Commands:    []string{fmt.Sprintf("%s connect --fix", prefix)},
				NeedsReload: true,
			},
			Host:    origin,
			Profile: profileName,
			OrgName: orgName,
			OrgID:   orgID,
			DualMCP: true,
			UserMCP: userHasMCP,
		}
	}

	if !userHasMCP {
		return Diagnose{
			OK:          false,
			Class:       "mcp_user_missing",
			WhatIsWrong: "Cursor user MCP is missing Autodevelop servers.",
			Steps: []string{
				"Rewrite user MCP from the current credential.",
				"Reload Cursor if tools still do not appear.",
			},
			Commands: []string{fmt.Sprintf("%s connect --fix", prefix), fmt.Sprintf("%s status", prefix)},
			Autofix: Autofix{
				Available:    true,
				Summary:      "Write ~/.cursor/mcp.json from the active credential host.",
				Commands:     []string{fmt.Sprintf("%s connect --fix", prefix)},
				NeedsReload:  true,
				NeedsBrowser: mcpattach.IsRemote(origin),
			},
			Host:    origin,
			Profile: profileName,
			OrgName: orgName,
			OrgID:   orgID,
		}
	}

	return Diagnose{
		OK:      true,
		Class:   "ok",
		Steps:   []string{},
		Commands: []string{},
		Autofix: emptyAutofix,
		Host:    origin,
		Profile: profileName,
		OrgName: orgName,
		OrgID:   orgID,
		UserMCP: true,
	}
}

// ApplyResult is the outcome of a safe autofix.
type ApplyResult struct {
	OK           bool      `json:"ok"`
	Diagnose     Diagnose  `json:"diagnose"`
	Applied      []string  `json:"applied"`
	NeedsReload  bool      `json:"needs_reload"`
	NeedsBrowser bool      `json:"needs_browser"`
	Error        string    `json:"error,omitempty"`
}

// Apply runs safe autofix for the current diagnose.
func Apply(opts Options) ApplyResult {
	cwd := opts.Cwd
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	path := opts.CredentialsPath
	if path == "" {
		path = credentials.DefaultPath(opts.Env)
	}
	diag := Build(opts)
	if !diag.Autofix.Available {
		return ApplyResult{
			OK:       false,
			Diagnose: diag,
			Error:    "No safe autofix is available for this failure.",
		}
	}

	applied := []string{}
	targetProfile := strings.TrimSpace(diag.Autofix.Profile)
	if targetProfile == "" {
		targetProfile = strings.TrimSpace(opts.Profile)
	}
	nextEnv := map[string]string{}
	for k, v := range opts.Env {
		nextEnv[k] = v
	}
	if targetProfile != "" {
		if _, err := credentials.SetActive(path, targetProfile); err != nil {
			return ApplyResult{OK: false, Diagnose: diag, Error: err.Error()}
		}
		nextEnv["AUTODEVELOP_PROFILE"] = targetProfile
		applied = append(applied, "active_profile:"+targetProfile)
	}

	cleared, err := mcpwrite.ClearRepoMCP(cwd)
	if err != nil {
		return ApplyResult{OK: false, Diagnose: diag, Applied: applied, Error: err.Error()}
	}
	if len(cleared) > 0 {
		names := make([]string, 0, len(cleared))
		for _, c := range cleared {
			names = append(names, filepath.Base(filepath.Dir(c))+"/"+filepath.Base(c))
		}
		applied = append(applied, "cleared_repo_mcp:"+strings.Join(names, ","))
	}

	origin := credentials.ResolveHost(nextEnv, opts.Host, path, targetProfile)
	dest, err := mcpwrite.WriteUserMCP(origin)
	if err != nil {
		return ApplyResult{OK: false, Diagnose: diag, Applied: applied, Error: err.Error()}
	}
	applied = append(applied, "wrote_user_mcp:"+dest)

	after := Build(Options{
		Env:             nextEnv,
		Cwd:             cwd,
		CredentialsPath: path,
		Profile:         targetProfile,
		Host:            opts.Host,
		Client:          opts.Client,
	})
	return ApplyResult{
		OK:           after.OK || after.Class == "ok",
		Diagnose:     after,
		Applied:      applied,
		NeedsReload:  diag.Autofix.NeedsReload || after.Autofix.NeedsReload,
		NeedsBrowser: diag.Autofix.NeedsBrowser,
	}
}

// FormatChat renders the diagnose for agent / human chat (no tokens).
func FormatChat(diag Diagnose) string {
	var b strings.Builder
	if diag.OK {
		b.WriteString("Autodevelop connection looks healthy.\n")
		if diag.Host != "" {
			fmt.Fprintf(&b, "Host: %s\n", diag.Host)
		}
		if diag.OrgName != "" || diag.OrgID != "" {
			label := diag.OrgName
			if label == "" {
				label = diag.OrgID
			}
			fmt.Fprintf(&b, "Organization: %s\n", label)
		}
		return strings.TrimRight(b.String(), "\n")
	}
	fmt.Fprintf(&b, "What is wrong: %s\n", diag.WhatIsWrong)
	if len(diag.Steps) > 0 {
		b.WriteString("\nSteps:\n")
		for i, step := range diag.Steps {
			fmt.Fprintf(&b, "%d. %s\n", i+1, step)
		}
	}
	if len(diag.Commands) > 0 {
		b.WriteString("\nCommands:\n")
		for _, cmd := range diag.Commands {
			if strings.HasPrefix(cmd, "#") {
				b.WriteString(cmd + "\n")
			} else {
				b.WriteString("  " + cmd + "\n")
			}
		}
	}
	if diag.Autofix.Available {
		b.WriteString("\n")
		fmt.Fprintf(&b, "Safe autofix available: %s\n", diag.Autofix.Summary)
		b.WriteString("Approve autofix? Reply yes or no.\n")
	}
	return strings.TrimRight(b.String(), "\n")
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
