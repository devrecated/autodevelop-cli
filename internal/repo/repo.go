// Copyright (c) 2026 Devrecated.
package repo

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	githubSSHRE  = regexp.MustCompile(`(?i)^(?:ssh://)?git@github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?/?$`)
	githubHTTPRE = regexp.MustCompile(`(?i)^https?://(?:www\.)?github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$`)
)

// FindRoot returns git toplevel from start, else start.
func FindRoot(start string) string {
	start = filepath.Clean(start)
	if start == "" {
		start, _ = os.Getwd()
	}
	cmd := exec.Command("git", "rev-parse", "--show-toplevel")
	cmd.Dir = start
	out, err := cmd.Output()
	if err != nil {
		return start
	}
	top := strings.TrimSpace(string(out))
	if top == "" {
		return start
	}
	return top
}

// NormalizeGitHubRemote turns a git remote URL into "github.com/owner/repo", or "".
func NormalizeGitHubRemote(remote string) string {
	remote = strings.TrimSpace(remote)
	if remote == "" {
		return ""
	}
	if m := githubSSHRE.FindStringSubmatch(remote); len(m) == 3 {
		return "github.com/" + m[1] + "/" + strings.TrimSuffix(m[2], ".git")
	}
	if m := githubHTTPRE.FindStringSubmatch(remote); len(m) == 3 {
		return "github.com/" + m[1] + "/" + strings.TrimSuffix(m[2], ".git")
	}
	return ""
}

// GitHubProject returns github.com/owner/repo for origin in root, or "".
func GitHubProject(root string) string {
	if root == "" {
		root, _ = os.Getwd()
	}
	cmd := exec.Command("git", "remote", "get-url", "origin")
	cmd.Dir = root
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return NormalizeGitHubRemote(strings.TrimSpace(string(out)))
}

// Resolve picks --dir, else prompts on TTY with default = FindRoot(cwd), else that default.
func Resolve(dirFlag, cwd string, interactive bool, stdin *os.File, stdout *os.File) (string, error) {
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	if v := strings.TrimSpace(dirFlag); v != "" {
		abs, err := filepath.Abs(v)
		if err != nil {
			return "", err
		}
		return abs, nil
	}
	def := FindRoot(cwd)
	if !interactive || stdin == nil || stdout == nil {
		return def, nil
	}
	if fi, err := stdin.Stat(); err != nil || (fi.Mode()&os.ModeCharDevice) == 0 {
		return def, nil
	}
	fmt.Fprintf(stdout, "Configure Autodevelop in: [%s] ", def)
	line, err := bufio.NewReader(stdin).ReadString('\n')
	if err != nil && len(strings.TrimSpace(line)) == 0 {
		return def, nil
	}
	line = strings.TrimSpace(line)
	if line == "" {
		return def, nil
	}
	abs, err := filepath.Abs(line)
	if err != nil {
		return "", err
	}
	return abs, nil
}
