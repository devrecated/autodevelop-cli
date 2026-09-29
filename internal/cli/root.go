// Copyright (c) 2026 Devrecated.
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/devrecated/autodevelop-cli/internal/credentials"
	"github.com/devrecated/autodevelop-cli/internal/hooks"
	"github.com/devrecated/autodevelop-cli/internal/install"
	"github.com/devrecated/autodevelop-cli/internal/kitmcp"
	"github.com/devrecated/autodevelop-cli/internal/login"
	"github.com/devrecated/autodevelop-cli/internal/mcphost"
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
  autodevelop github init|status|token
  autodevelop mcp
  autodevelop kit-mcp
  autodevelop hook <id>
  autodevelop version

AUTODEVELOP_TOKEN wins over the credentials file when set.
AUTODEVELOP_PROFILE selects a stored login for one process.
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
		stored := credentials.ReadFile(creds, env, profile)
		src := credentials.TokenSource(env, creds, profile)
		origin := credentials.ResolveHost(env, hostFlag, creds, profile)
		out := map[string]any{
			"signed_in": src != "",
			"source":    src,
			"host":      origin,
			"root":      root,
			"version":   version.Version,
		}
		if stored != nil {
			if stored.IssuedAt != nil {
				out["issued_at"] = *stored.IssuedAt
			}
			if stored.OrgID != nil {
				out["org_id"] = *stored.OrgID
			}
		}
		active, _ := credentials.ResolveProfileName(env, profile, credentials.ReadStore(creds).Active)
		out["profile"] = active
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
		fmt.Println("Root:", root)
		return 0
	case "profiles", "profile":
		for _, p := range credentials.ListSummaries(creds, env) {
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
		fmt.Fprintln(os.Stderr, "github subcommands: port in progress — install the GitHub App from the host after login.")
		return 1
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n%s", cmd, Usage())
		return 1
	}
}
