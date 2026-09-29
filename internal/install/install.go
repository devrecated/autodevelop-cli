// Copyright (c) 2026 Devrecated.
// Pull kit + org policy pack into the chosen repo; wire MCP configs.
package install

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/devrecated/autodevelop-cli/internal/credentials"
	"github.com/devrecated/autodevelop-cli/internal/host"
	"github.com/devrecated/autodevelop-cli/internal/mcpwrite"
)

type Options struct {
	Env             map[string]string
	Host            string
	Slug            string
	Root            string
	CredentialsPath string
	Client          *http.Client
	SkipKit         bool
	Write           func(string)
}

func Run(opts Options) error {
	if opts.Env == nil {
		opts.Env = map[string]string{}
		for _, e := range os.Environ() {
			k, v, ok := strings.Cut(e, "=")
			if ok {
				opts.Env[k] = v
			}
		}
	}
	if opts.Client == nil {
		opts.Client = http.DefaultClient
	}
	if opts.Write == nil {
		opts.Write = func(s string) { fmt.Fprint(os.Stdout, s) }
	}
	root := opts.Root
	if root == "" {
		return fmt.Errorf("repository root is required")
	}
	path := opts.CredentialsPath
	if path == "" {
		path = credentials.DefaultPath(opts.Env)
	}
	origin := credentials.ResolveHost(opts.Env, opts.Host, path, "")
	credential := credentials.ReadToken(opts.Env, path, "")
	if credential == "" {
		return fmt.Errorf("Not signed in. Run autodevelop login.")
	}

	if !opts.SkipKit {
		if err := downloadAndApplyKit(opts.Client, origin, credential, root); err != nil {
			return err
		}
		opts.Write("Applied Autodevelop kit.\n")
	}

	slug := strings.TrimSpace(opts.Slug)
	packURL := host.Join(origin, "/cli/pack")
	if slug != "" {
		packURL += "?slug=" + slug
	}
	req, err := http.NewRequest(http.MethodGet, packURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+credential)
	resp, err := opts.Client.Do(req)
	if err != nil {
		return host.WrapFetchError(err, origin)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == 403 {
		return fmt.Errorf("%s", host.BillingExpired)
	}
	if resp.StatusCode >= 300 {
		var errBody map[string]any
		_ = json.Unmarshal(raw, &errBody)
		msg, _ := errBody["error"].(string)
		if msg == "" {
			msg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return fmt.Errorf("%s", msg)
	}
	var pack struct {
		Slug              string `json:"slug"`
		PolicyPackVersion string `json:"policyPackVersion"`
		Files             []struct {
			Dest    string `json:"dest"`
			Content string `json:"content"`
		} `json:"files"`
	}
	if err := json.Unmarshal(raw, &pack); err != nil {
		return err
	}
	wrote := 0
	for _, f := range pack.Files {
		dest := strings.ReplaceAll(f.Dest, `\`, "/")
		if dest == "mcp.json" || strings.Contains(dest, "..") || strings.Contains(dest, ".cursor/private") {
			continue
		}
		abs := filepath.Join(root, filepath.FromSlash(dest))
		rel, err := filepath.Rel(root, abs)
		if err != nil || strings.HasPrefix(rel, "..") {
			return fmt.Errorf("Refusing to write outside the repository: %s", dest)
		}
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			return err
		}
		mode := os.FileMode(0o644)
		if strings.HasSuffix(dest, "credentials.json") {
			mode = 0o600
		}
		if err := os.WriteFile(abs, []byte(f.Content), mode); err != nil {
			return err
		}
		wrote++
	}

	if _, err := mcpwrite.WriteWorkspaceMCP(root, origin); err != nil {
		return err
	}
	if _, err := mcpwrite.WriteClaudeMCP(root, origin); err != nil {
		return err
	}
	if _, err := mcpwrite.WriteUserMCP(origin); err != nil {
		return err
	}
	opts.Write("Wrote Cursor, Claude, and user MCP config (autodevelop binary).\n")
	opts.Write(fmt.Sprintf("Installed policy pack %s for %s (%d files).\n", pack.PolicyPackVersion, pack.Slug, wrote))
	return nil
}

func downloadAndApplyKit(client *http.Client, origin, credential, root string) error {
	req, err := http.NewRequest(http.MethodGet, host.Join(origin, "/cli/kit"), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/gzip")
	req.Header.Set("Authorization", "Bearer "+credential)
	resp, err := client.Do(req)
	if err != nil {
		return host.WrapFetchError(err, origin)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 403 {
		return fmt.Errorf("%s", host.BillingExpired)
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("kit download failed: HTTP %d", resp.StatusCode)
	}
	stage := filepath.Join(root, ".cursor", "local", "autodevelop-plugin")
	_ = os.RemoveAll(stage)
	if err := os.MkdirAll(stage, 0o755); err != nil {
		return err
	}
	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		name := filepath.Clean(hdr.Name)
		if strings.HasPrefix(name, "..") {
			continue
		}
		target := filepath.Join(stage, name)
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			f, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(hdr.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(f, tr); err != nil {
				f.Close()
				return err
			}
			f.Close()
		}
	}
	return applyCursorKit(stage, root)
}

func applyCursorKit(pluginRoot, repo string) error {
	candidates := []string{
		filepath.Join(pluginRoot, "kits", "cursor"),
		filepath.Join(pluginRoot, ".cursor-template"),
	}
	var src string
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			src = c
			break
		}
	}
	if src == "" {
		return nil
	}
	// Replace shared kit dirs under .cursor/
	for _, name := range []string{"rules", "hooks", "commands", "agents", "skills"} {
		from := filepath.Join(src, name)
		if _, err := os.Stat(from); err != nil {
			continue
		}
		to := filepath.Join(repo, ".cursor", name)
		_ = os.RemoveAll(to)
		if err := copyTree(from, to); err != nil {
			return err
		}
	}
	// Prefer binary hooks.json from kits/cursor if present; rewrite node → autodevelop after copy.
	hooksSrc := filepath.Join(src, "hooks.json")
	if _, err := os.Stat(hooksSrc); err == nil {
		dest := filepath.Join(repo, ".cursor", "hooks.json")
		raw, err := os.ReadFile(hooksSrc)
		if err != nil {
			return err
		}
		raw = rewriteHooksJSON(raw)
		if err := os.WriteFile(dest, raw, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func rewriteHooksJSON(raw []byte) []byte {
	s := string(raw)
	// node …/name.mjs → autodevelop hook name
	re := regexp.MustCompile(`node\s+[^"'\s]*/([\w-]+)\.mjs`)
	s = re.ReplaceAllString(s, `autodevelop hook $1`)
	return []byte(s)
}

func copyTree(src, dest string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dest, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
		if err != nil {
			return err
		}
		defer out.Close()
		_, err = io.Copy(out, in)
		return err
	})
}
