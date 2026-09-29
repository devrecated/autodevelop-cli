// Copyright (c) 2026 Devrecated.
package cli

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/devrecated/autodevelop-cli/internal/credentials"
	"github.com/devrecated/autodevelop-cli/internal/github"
	"github.com/devrecated/autodevelop-cli/internal/hooks"
	"github.com/devrecated/autodevelop-cli/internal/install"
	"github.com/devrecated/autodevelop-cli/internal/kitmcp"
	"github.com/devrecated/autodevelop-cli/internal/knowledge"
	"github.com/devrecated/autodevelop-cli/internal/login"
	"github.com/devrecated/autodevelop-cli/internal/mcphost"
	"github.com/devrecated/autodevelop-cli/internal/packstatus"
	"github.com/devrecated/autodevelop-cli/internal/repo"
	"github.com/devrecated/autodevelop-cli/internal/version"
)

func Usage() string {
	return strings.TrimSpace(`
Autodevelop CLI

  autodevelop login [--dir <path>] [--slug <instance>] [--profile <name>] [--no-install] [--no-open]
  autodevelop logout [--profile <name>]
  autodevelop status [--dir <path>]
  autodevelop profiles
  autodevelop install [--dir <path>] [--slug <instance>]
  autodevelop github init|status|token [--account <login>]
  autodevelop knowledge archive|restore|archived [--node <id>] [--org <id>] [--repo-url <url>]
  autodevelop mcp
  autodevelop kit-mcp
  autodevelop hook <id>
  autodevelop version

AUTODEVELOP_TOKEN wins over the credentials file when set.
AUTODEVELOP_PROFILE selects a stored login for one process.
Login binds the current GitHub origin (github.com/owner/repo) to that profile
so other Cursor windows can stay on a different org.
`) + "\n"
}

func environ() map[string]string {
	out := map[string]string{}
	for _, e := range os.Environ() {
		k, v, ok := strings.Cut(e, "=")
		if ok {
			out[k] = v
		}
	}
	return out
}

func flagValue(args []string, name string) string {
	for i := 0; i < len(args); i++ {
		a := args[i]
		if a == "--"+name && i+1 < len(args) {
			return args[i+1]
		}
		if strings.HasPrefix(a, "--"+name+"=") {
			return strings.TrimPrefix(a, "--"+name+"=")
		}
	}
	return ""
}

func hasFlag(args []string, name string) bool {
	for _, a := range args {
		if a == "--"+name {
			return true
		}
	}
	return false
}

func Run(argv []string) int {
	if len(argv) == 0 {
		argv = []string{"status"}
	}
	cmd := argv[0]
	args := argv[1:]
	if cmd == "help" || hasFlag(argv, "help") || hasFlag(args, "help") {
		fmt.Print(Usage())
		return 0
	}
	env := environ()
	creds := flagValue(args, "credentials")
	if creds == "" {
		creds = credentials.DefaultPath(env)
	}
	profile := flagValue(args, "profile")
	hostFlag := flagValue(args, "host")
	slug := flagValue(args, "slug")
	dirFlag := flagValue(args, "dir")

	switch cmd {
	case "version":
		fmt.Println(version.Version)
		return 0
	case "login":
		root, err := repo.Resolve(dirFlag, "", true, os.Stdin, os.Stdout)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		if err := login.Run(login.Options{
			Env:             env,
			Host:            hostFlag,
			CredentialsPath: creds,
			Profile:         profile,
			NoOpen:          hasFlag(args, "no-open"),
		}); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		active, _ := credentials.ResolveProfileName(env, profile, "")
		if project := repo.GitHubProject(root); project != "" && active != "" {
			_ = credentials.BindProject(creds, project, active)
		}
		if !hasFlag(args, "no-install") {
			if err := install.Run(install.Options{
				Env:             env,
				Host:            hostFlag,
				Slug:            slug,
				Root:            root,
				CredentialsPath: creds,
			}); err != nil {
				fmt.Fprintln(os.Stderr, err)
				return 1
			}
		}
		return 0
	case "logout":
		if profile != "" {
			empty, active, removed, err := credentials.ClearProfile(creds, profile, env)
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				return 1
			}
			if empty {
				fmt.Println("Signed out. Removed last profile:", removed)
			} else {
				fmt.Printf("Removed profile %s. Active: %s\n", removed, active)
			}
			return 0
		}
		_ = credentials.ClearFile(creds)
		fmt.Println("Signed out.")
		return 0
	case "status":
		root, _ := repo.Resolve(dirFlag, "", false, nil, nil)
		project := repo.GitHubProject(root)
		active, _ := credentials.ResolveEffectiveProfile(env, profile, creds, project)
		stored := credentials.ReadFile(creds, env, active)
		src := credentials.TokenSource(env, creds, active)
		origin := credentials.ResolveHost(env, hostFlag, creds, active)
		out := map[string]any{
			"signed_in": src != "",
			"host":      origin,
			"project":   project,
			"root":      root,
			"version":   version.Version,
			"profile":   active,
		}
		if stored != nil {
			if stored.IssuedAt != nil {
				out["issued_at"] = *stored.IssuedAt
			}
			if stored.OrgID != nil {
				out["org_id"] = *stored.OrgID
			}
		}
		if hasFlag(args, "json") {
			enc, _ := json.MarshalIndent(out, "", "  ")
			fmt.Println(string(enc))
			return 0
		}
		if src == "" {
			fmt.Println("Not signed in.")
			return 0
		}
		fmt.Println("Signed in.")
		fmt.Println("Profile:", active)
		fmt.Println("Source:", src)
		fmt.Println("Host:", origin)
		if stored != nil && stored.OrgID != nil && *stored.OrgID != "" {
			fmt.Println("Organization:", *stored.OrgID)
		}
		if stored != nil && stored.IssuedAt != nil && *stored.IssuedAt != "" {
			fmt.Println("Issued:", *stored.IssuedAt)
		}
		instance := packstatus.InferSlug(root, slug)
		localVersion := packstatus.ReadLocalVersion(root, instance)
		if instance != "" {
			fmt.Println("Instance:", instance)
		}
		if localVersion != "" {
			fmt.Println("Local policy pack:", localVersion)
		}
		fmt.Println("Credentials file:", creds)
		if localVersion != "" {
			credential := credentials.ReadToken(env, creds, active)
			remote, err := packstatus.Fetch(http.DefaultClient, origin, credential, instance, localVersion)
			if err != nil {
				fmt.Println("Hosted pack version: unreachable")
			} else {
				fmt.Println("Hosted policy pack:", remote.HostedVersion)
				if remote.Compatible != nil && !*remote.Compatible {
					fmt.Println("Hosted pack version differs. Ask before running install again.")
				}
			}
		}
		if project != "" {
			fmt.Println("Current Project:", project)
		} else if root != "" {
			fmt.Println("Current Project:", root)
		}
		return 0
	case "profiles", "profile":
		if profile != "" {
			name, err := credentials.SetActive(creds, profile)
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				return 1
			}
			fmt.Println("Active profile:", name)
			return 0
		}
		rows := credentials.ListSummaries(creds, env)
		if len(rows) == 0 {
			fmt.Println("No stored profiles.")
			return 0
		}
		for _, p := range rows {
			mark := " "
			if p.Active {
				mark = "*"
			}
			hostStr := ""
			if p.Host != nil {
				hostStr = *p.Host
			}
			fmt.Printf("%s %s %s\n", mark, p.Name, hostStr)
		}
		return 0
	case "install":
		root, err := repo.Resolve(dirFlag, "", true, os.Stdin, os.Stdout)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		if err := install.Run(install.Options{
			Env:             env,
			Host:            hostFlag,
			Slug:            slug,
			Root:            root,
			CredentialsPath: creds,
		}); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		return 0
	case "mcp":
		if err := mcphost.Run(mcphost.Options{Env: env, Host: hostFlag, CredentialsPath: creds}); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		return 0
	case "kit-mcp":
		if err := kitmcp.Run(os.Stdin, os.Stdout); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		return 0
	case "hook":
		if len(args) < 1 {
			fmt.Fprintln(os.Stderr, "usage: autodevelop hook <id>")
			return 1
		}
		if err := hooks.Run(args[0], os.Stdin, os.Stdout); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		return 0
	case "github":
		sub := ""
		if len(args) > 0 && !strings.HasPrefix(args[0], "--") {
			sub = args[0]
		}
		root, _ := repo.Resolve(dirFlag, "", false, nil, nil)
		project := repo.GitHubProject(root)
		if err := github.Run(github.Options{
			Env:             env,
			Host:            hostFlag,
			CredentialsPath: creds,
			Profile:         profile,
			Project:         project,
			Command:         sub,
			Account:         flagValue(args, "account"),
			NoOpen:          hasFlag(args, "no-open"),
			JSON:            hasFlag(args, "json"),
		}); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		return 0
	case "knowledge":
		action := ""
		if len(args) > 0 && !strings.HasPrefix(args[0], "--") {
			action = args[0]
		}
		root, _ := repo.Resolve(dirFlag, "", false, nil, nil)
		project := repo.GitHubProject(root)
		if err := knowledge.Run(knowledge.Options{
			Env:             env,
			Host:            hostFlag,
			CredentialsPath: creds,
			Profile:         profile,
			Project:         project,
			Action:          action,
			Node:            flagValue(args, "node"),
			Org:             flagValue(args, "org"),
			RepoURL:         flagValue(args, "repo-url"),
			Root:            root,
			JSON:            hasFlag(args, "json"),
		}); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		return 0
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n%s", cmd, Usage())
		return 1
	}
}
