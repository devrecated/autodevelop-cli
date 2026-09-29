// Copyright (c) 2026 Devrecated.
package repo

import "testing"

func TestNormalizeGitHubRemote(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"git@github.com:devrecated/autodevelop.git", "github.com/devrecated/autodevelop"},
		{"git@github.com:devrecated/autodevelop", "github.com/devrecated/autodevelop"},
		{"https://github.com/devrecated/autodevelop.git", "github.com/devrecated/autodevelop"},
		{"https://github.com/devrecated/autodevelop", "github.com/devrecated/autodevelop"},
		{"ssh://git@github.com/devrecated/autodevelop.git", "github.com/devrecated/autodevelop"},
		{"https://gitlab.com/foo/bar.git", ""},
		{"", ""},
	}
	for _, c := range cases {
		if got := NormalizeGitHubRemote(c.in); got != c.want {
			t.Errorf("NormalizeGitHubRemote(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
