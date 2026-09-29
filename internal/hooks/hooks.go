// Copyright (c) 2026 Devrecated.
// Editor hooks as binary subcommands: autodevelop hook <id>
package hooks

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type Decision map[string]any

func allow(_ map[string]any) Decision {
	return Decision{"permission": "allow"}
}

func deny(user, agent string) Decision {
	return Decision{
		"permission":    "deny",
		"user_message":  user,
		"agent_message": agent,
	}
}

func ask(user, agent string) Decision {
	return Decision{
		"permission":    "ask",
		"user_message":  user,
		"agent_message": agent,
	}
}

func asString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case fmt.Stringer:
		return t.String()
	default:
		return ""
	}
}

func collectStrings(v any, out *[]string) {
	switch t := v.(type) {
	case string:
		if strings.TrimSpace(t) != "" {
			*out = append(*out, t)
		}
	case []any:
		for _, item := range t {
			collectStrings(item, out)
		}
	case map[string]any:
		for _, item := range t {
			collectStrings(item, out)
		}
	}
}

func commandFrom(input map[string]any) string {
	if s := asString(input["command"]); s != "" {
		return s
	}
	if s := asString(input["cmd"]); s != "" {
		return s
	}
	var strs []string
	collectStrings(input, &strs)
	for _, s := range strs {
		if strings.ContainsAny(s, " \t") {
			return s
		}
	}
	return ""
}

func promptFrom(input map[string]any) string {
	for _, key := range []string{"prompt", "user_prompt", "userPrompt", "text"} {
		if s := asString(input[key]); s != "" {
			return s
		}
	}
	var strs []string
	collectStrings(input, &strs)
	for _, s := range strs {
		if len(s) > 8 {
			return s
		}
	}
	return ""
}

func toolPath(input map[string]any) string {
	tool, _ := input["tool_input"].(map[string]any)
	if tool == nil {
		tool, _ = input["toolInput"].(map[string]any)
	}
	if tool == nil {
		tool, _ = input["arguments"].(map[string]any)
	}
	for _, key := range []string{"path", "file_path", "filePath", "target_file"} {
		if tool != nil {
			if s := asString(tool[key]); s != "" {
				return s
			}
		}
		if s := asString(input[key]); s != "" {
			return s
		}
	}
	return ""
}

func toolContent(input map[string]any) string {
	tool, _ := input["tool_input"].(map[string]any)
	if tool == nil {
		tool, _ = input["toolInput"].(map[string]any)
	}
	if tool == nil {
		tool, _ = input["arguments"].(map[string]any)
	}
	parts := []string{}
	if tool != nil {
		for _, key := range []string{"contents", "new_string", "content"} {
			if s := asString(tool[key]); s != "" {
				parts = append(parts, s)
			}
		}
	}
	if s := asString(input["content"]); s != "" {
		parts = append(parts, s)
	}
	return strings.Join(parts, "\n")
}

func workspaceRoot(input map[string]any) string {
	for _, key := range []string{"workspace_roots", "workspaceRoots"} {
		if arr, ok := input[key].([]any); ok && len(arr) > 0 {
			if s := asString(arr[0]); s != "" {
				return filepath.Clean(s)
			}
		}
	}
	for _, key := range []string{"workspace_path", "workspacePath", "cwd", "root"} {
		if s := asString(input[key]); s != "" {
			return filepath.Clean(s)
		}
	}
	cwd, _ := os.Getwd()
	return cwd
}

var (
	reSecretPath = regexp.MustCompile(`(?i)(?:^|[\s'"=/])(?:\.env(?:\.[A-Za-z0-9._-]*)?|tests/\.env|tests/portal/\.auth(?:/\S*)?|serviceAccount\.json|firebase-admin[^/\s]*\.json|service\.json|\S*\.pem)(?:\s|$|["'])`)
	reModelsTgz  = regexp.MustCompile(`(?i)packages/models/[^/\s]*\.tgz`)
	reFirebase   = regexp.MustCompile(`(?i)(?:^|[\s'"=/])\.firebase(?:/|\s|$)`)
	reGitStage   = regexp.MustCompile(`(?i)\bgit\s+(?:add|commit|rm(?:\s+--cached)?)\b`)
	reForcePush  = regexp.MustCompile(`(?i)\bgit\s+push\b[\s\S]*(?:--force(?:-with-lease)?(?:\s|$)|(?:^|\s)-f(?:\s|$))`)
	reNoVerify   = regexp.MustCompile(`(?i)\bgit\s+(?:commit|push)\b[\s\S]*--no-verify\b`)
	reProdScript = regexp.MustCompile(`(?i)\b(?:env:prod|deploy:prod|release:prod|release-prod|deploy:docs:prod|docs-release-prod|docs-deploy-prod)\b`)
	reProdAPI    = regexp.MustCompile(`(?i)\bgcloud\s+run\s+deploy\s+\S+-prod\b`)
	rePortalVid  = regexp.MustCompile(`(?i)\b(?:test:portal:videos|superadmin-videos\.spec|mutating\s+demo)\b`)
	reShellSplit = regexp.MustCompile(`&&|\|\||;|\n`)
	reBareFB     = regexp.MustCompile(`(?i)^(?:sudo\s+)?(?:npx\s+|pnpm\s+exec\s+|pnpm\s+dlx\s+|npm\s+exec\s+|yarn\s+(?:dlx\s+)?)?firebase\s+deploy\b`)
	reBareGC     = regexp.MustCompile(`(?i)^(?:sudo\s+)?gcloud\s+run\s+deploy\b`)
	reHostChan   = regexp.MustCompile(`(?i)hosting:channel:(deploy|delete)`)
	reLiveChan   = regexp.MustCompile(`(?i)(?:channelId|--channel)\s*[:=]?\s*live\b|hosting:channel:\w+\s+live\b`)
	reMailWrite  = regexp.MustCompile(`send-stakeholder-mail\.mjs|\.collection\(\s*['"]mail['"]\s*\)|collection\(\s*['"]mail['"]\s*\)`)
	reConfirm    = regexp.MustCompile(`--confirm(?:=|\s+)([A-Za-z0-9]+)`)
	reRiskPrompt = regexp.MustCompile(`(?i)(?:deploy(?:ing)?\s+prod|production\s+deploy|env:prod|deploy:prod|release:prod|release-prod|force[-\s]?push|git\s+push\s+-f|--force-with-lease|--no-verify|skip(?:ping)?\s+hooks|commit\s+\.env|check\s+in\s+\.env|record(?:ing)?\s+portal\s+videos?\s+on\s+prod)`)
	reClientSDK  = regexp.MustCompile(`from\s+["']@devrecated/[a-z0-9-]+-sdk(/[^"']*)?["']|(?:import|require)\s*\(\s*["']@devrecated/[a-z0-9-]+-sdk(/[^"']*)?["']\s*\)|packages/[a-z0-9-]+-sdk`)
	reServices   = regexp.MustCompile(`from\s+["'][^"']*/services/|(?:import|require)\s*\(\s*["'][^"']*/services/`)
	reSvcPath    = regexp.MustCompile(`(^|/)services/`)
	reSDKPath    = regexp.MustCompile(`(^|/)packages/[a-z0-9-]+-sdk/`)
	reCLIPath    = regexp.MustCompile(`(^|/)packages/cli/(bin|cmd|internal)/|(^|/)scripts/cli/node/(customer|login|install|github|host|mcp-host|credentials|kit|direct-run|parse|host-mcp|kit-mcp|user-mcp|workspace-mcp)\.`)
)

func splitShell(command string) []string {
	parts := reShellSplit.Split(command, -1)
	var out []string
	for _, p := range parts {
		// also split on single pipe without lookahead
		for _, seg := range strings.Split(p, "|") {
			if s := strings.TrimSpace(seg); s != "" {
				out = append(out, s)
			}
		}
	}
	return out
}

func isBareDeploy(command string) bool {
	for _, s := range splitShell(command) {
		if reBareFB.MatchString(s) || reBareGC.MatchString(s) {
			return true
		}
	}
	return false
}

func guardShell(input map[string]any) Decision {
	command := commandFrom(input)
	if strings.TrimSpace(command) == "" {
		return allow(input)
	}
	if reHostChan.MatchString(command) {
		if reLiveChan.MatchString(command) {
			return deny(
				"Blocked: do not deploy or delete the live Hosting channel.",
				"A project hook denied hosting:channel live.",
			)
		}
		return ask(
			"Confirm hosting channel deploy/delete. Prefer the documented preview project.",
			"A project hook asks before hosting:channel commands.",
		)
	}
	if reForcePush.MatchString(command) || reNoVerify.MatchString(command) {
		return deny(
			"Blocked: do not force-push or skip git hooks. Use a normal push without --force / --no-verify.",
			"A project hook denied git --force or --no-verify.",
		)
	}
	if reGitStage.MatchString(command) {
		if reSecretPath.MatchString(command) {
			return deny(
				"Blocked: do not stage secrets. Use pnpm env:sandbox / pnpm env:prod and Secret Manager.",
				"A project hook denied git add/commit of .env, service accounts, or auth state.",
			)
		}
		if reModelsTgz.MatchString(command) {
			return deny(
				"Blocked: do not commit packages/models/*.tgz. CI copies the built tarball into services/functions/models.tgz.",
				"A project hook denied staging packages/models tarballs.",
			)
		}
		if reFirebase.MatchString(command) {
			return deny(
				"Blocked: do not commit .firebase/ hosting cache. Leave that directory untracked.",
				"A project hook denied staging .firebase cache files.",
			)
		}
	}
	if rePortalVid.MatchString(command) && reProdScript.MatchString(command) {
		return deny(
			"Blocked: portal demo videos cannot run with a production env or deploy command. Use pnpm env:sandbox, then record-docs-media.",
			"A project hook denied portal videos combined with a production command.",
		)
	}
	if reProdScript.MatchString(command) || reProdAPI.MatchString(command) {
		return ask(
			"Confirm production action. Prefer pnpm env:sandbox / pnpm deploy:stg unless this is an intentional prod release via pnpm env:prod and pnpm deploy:*.",
			"A project hook asks before production env or deploy commands.",
		)
	}
	if isBareDeploy(command) {
		return ask(
			"Confirm raw deploy. Use this repository’s documented deploy scripts instead of a bare firebase or gcloud deploy.",
			"A project hook asks before undeclared firebase or gcloud deploy commands.",
		)
	}
	return allow(input)
}

func guardStakeholderMail(input map[string]any) Decision {
	command := commandFrom(input)
	if !reMailWrite.MatchString(command) {
		return allow(input)
	}
	if m := reConfirm.FindStringSubmatch(command); m != nil && len(m[1]) >= 6 {
		// Token shape check only (full HMAC lives in Node confirm-token); require explicit --confirm.
		return allow(input)
	}
	return deny(
		"Blocked: stakeholder mail needs an explicit yes and --confirm <token>.",
		"A project hook denied Firestore mail / send-stakeholder-mail without a valid confirm token.",
	)
}

func gatePrompt(input map[string]any) Decision {
	prompt := promptFrom(input)
	if !reRiskPrompt.MatchString(prompt) {
		return Decision{}
	}
	return Decision{
		"continue": true,
		"user_message": "High-risk intent noted. Production deploy, force-push, skipped hooks, committed secrets, and prod portal videos are gated: the shell hook will ask or deny. Prefer pnpm env:sandbox / deploy:stg; production needs an explicit confirm.",
	}
}

func guardPackageBoundaries(input map[string]any) Decision {
	path := filepath.ToSlash(toolPath(input))
	content := toolContent(input)
	var notes []string
	if reSvcPath.MatchString(path) && reClientSDK.MatchString(content) {
		notes = append(notes, "DENIED: services/** must not import @devrecated/*-sdk. Share contracts via @devrecated/models.")
	}
	if reSDKPath.MatchString(path) && reServices.MatchString(content) {
		notes = append(notes, "DENIED: packages/*-sdk must not import services/**. Keep SDKs client-only.")
	}
	if reCLIPath.MatchString(path) && reServices.MatchString(content) {
		notes = append(notes, "DENIED: customer CLI entry must not import services/**. Use SDK or models.")
	}
	if len(notes) == 0 {
		return Decision{}
	}
	msg := strings.Join(notes, " ")
	return deny(msg, msg)
}

func sessionContext(_ map[string]any) Decision {
	return Decision{
		"additional_context": "Autodevelop is active. Use kit MCP and host MCP tools when relevant.",
	}
}

func ticketRequired(input map[string]any) Decision {
	root := workspaceRoot(input)
	session := filepath.Join(root, ".cursor", "local", "gh-projects", "session.json")
	if _, err := os.Stat(session); err != nil {
		return Decision{
			"additional_context": "No board ticket bound (.cursor/local/gh-projects/session.json missing). Bind one with issues_ensure before product work.",
		}
	}
	return Decision{}
}

// IDs match former .mjs basenames without extension.
var known = map[string]func(map[string]any) Decision{
	"guard-shell":              guardShell,
	"guard-stakeholder-mail":   guardStakeholderMail,
	"gate-prompt":              gatePrompt,
	"guard-package-boundaries": guardPackageBoundaries,
	"nudge-edits":              allow,
	"ticket-progress-files":    allow,
	"ticket-required":          ticketRequired,
	"session-context":          sessionContext,
	"ticket-session":           allow,
	"log-session-outcome":      allow,
	"session-end-nudge":        allow,
	"pr-link-hint":             allow,
	"ready-for-feedback":       allow,
	"plan-completion-check":    allow,
	"owner-acceptance-nudge":   allow,
	"version-changelog-nudge":  allow,
	"release-acceptance-guard": allow,
	"worktree-info":            allow,
	"worktree-status":          allow,
	"ticket-progress-stop":     allow,
}

// PathID maps a legacy node path or basename to a hook id.
func PathID(arg string) string {
	arg = strings.TrimSpace(arg)
	arg = strings.TrimSuffix(arg, ".mjs")
	arg = strings.ReplaceAll(arg, `\`, "/")
	if i := strings.LastIndex(arg, "/"); i >= 0 {
		arg = arg[i+1:]
	}
	return arg
}

func Run(id string, stdin io.Reader, stdout io.Writer) error {
	if stdin == nil {
		stdin = os.Stdin
	}
	if stdout == nil {
		stdout = os.Stdout
	}
	id = PathID(id)
	fn, ok := known[id]
	if !ok {
		fn = allow
	}
	raw, err := io.ReadAll(stdin)
	if err != nil {
		return err
	}
	var input map[string]any
	if len(strings.TrimSpace(string(raw))) > 0 {
		_ = json.Unmarshal(raw, &input)
	}
	if input == nil {
		input = map[string]any{}
	}
	out := fn(input)
	if out == nil {
		out = Decision{}
	}
	enc, err := json.Marshal(out)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(stdout, "%s\n", enc)
	return err
}

func List() []string {
	ids := make([]string, 0, len(known))
	for k := range known {
		ids = append(ids, k)
	}
	return ids
}
