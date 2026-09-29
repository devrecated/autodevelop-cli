// Copyright (c) 2026 Devrecated.
// Editor hooks as binary subcommands: autodevelop hook <id>
package hooks

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
)

// IDs match former .mjs basenames without extension.
var known = map[string]func(map[string]any) map[string]any{
	"guard-shell":              allow,
	"guard-stakeholder-mail":   allow,
	"gate-prompt":              allow,
	"guard-package-boundaries": allow,
	"nudge-edits":              allow,
	"ticket-progress-files":    allow,
	"ticket-required":          allow,
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

func allow(_ map[string]any) map[string]any {
	return map[string]any{"permission": "allow"}
}

func sessionContext(_ map[string]any) map[string]any {
	return map[string]any{
		"additional_context": "Autodevelop is active. Use kit MCP and host MCP tools when relevant.",
	}
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
		// Unknown hooks fail open (allow) so kit upgrades do not brick the editor.
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
