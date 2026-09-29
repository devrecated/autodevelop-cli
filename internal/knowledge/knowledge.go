// Copyright (c) 2026 Devrecated.
// Archive tickets and recaps through the host. Does not write the database.
package knowledge

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/devrecated/autodevelop-cli/internal/credentials"
	"github.com/devrecated/autodevelop-cli/internal/host"
	"github.com/devrecated/autodevelop-cli/internal/repo"
)

type Options struct {
	Env             map[string]string
	Host            string
	CredentialsPath string
	Profile         string
	Project         string
	Action          string
	Node            string
	Org             string
	RepoURL         string
	Root            string
	JSON            bool
	Client          *http.Client
	Stdout          io.Writer
}

type result struct {
	Node struct {
		Label      string `json:"label"`
		ArchivedAt string `json:"archived_at"`
	} `json:"node"`
	Nodes []any  `json:"nodes"`
	Error string `json:"error"`
}

func Run(opts Options) error {
	if opts.Stdout == nil {
		opts.Stdout = os.Stdout
	}
	if opts.Client == nil {
		opts.Client = http.DefaultClient
	}
	action := strings.TrimSpace(opts.Action)
	switch action {
	case "archive", "restore", "archived":
	default:
		return errors.New("Unknown knowledge command. Use archive, restore, or archived.")
	}
	if (action == "archive" || action == "restore") && strings.TrimSpace(opts.Node) == "" {
		return errors.New("Pass --node <id>.")
	}
	path := opts.CredentialsPath
	if path == "" {
		path = credentials.DefaultPath(opts.Env)
	}
	profile, err := credentials.ResolveEffectiveProfile(opts.Env, opts.Profile, path, opts.Project)
	if err != nil {
		return err
	}
	token := credentials.ReadToken(opts.Env, path, profile)
	if strings.TrimSpace(token) == "" {
		return errors.New("Not signed in. Run autodevelop login.")
	}
	origin := credentials.ResolveHost(opts.Env, opts.Host, path, profile)
	repoURL := strings.TrimSpace(opts.RepoURL)
	if repoURL == "" && opts.Root != "" {
		repoURL = repo.OriginURL(opts.Root)
	}
	method, reqPath := request(action, opts.Node, opts.Org, repoURL)
	var body io.Reader
	if method == http.MethodPost {
		body = bytes.NewReader([]byte("{}"))
	}
	req, err := http.NewRequest(method, host.Join(origin, reqPath), body)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := opts.Client.Do(req)
	if err != nil {
		return host.WrapFetchError(err, origin)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var data result
	_ = json.Unmarshal(raw, &data)
	if resp.StatusCode == http.StatusForbidden {
		return errors.New(host.BillingExpired)
	}
	if resp.StatusCode >= 400 {
		if data.Error != "" {
			return errors.New(data.Error)
		}
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	if opts.JSON {
		fmt.Fprintln(opts.Stdout, string(raw))
		return nil
	}
	if data.Node.Label != "" {
		state := "restored"
		if data.Node.ArchivedAt != "" {
			state = "archived"
		}
		fmt.Fprintf(opts.Stdout, "%s %s\n", data.Node.Label, state)
		return nil
	}
	fmt.Fprintf(opts.Stdout, "Archived nodes: %d\n", len(data.Nodes))
	return nil
}

func request(action, nodeID, orgID, repoURL string) (method, path string) {
	query := url.Values{}
	if strings.TrimSpace(orgID) != "" {
		query.Set("org_id", strings.TrimSpace(orgID))
	}
	if strings.TrimSpace(repoURL) != "" {
		query.Set("repo_url", strings.TrimSpace(repoURL))
	}
	suffix := ""
	if encoded := query.Encode(); encoded != "" {
		suffix = "?" + encoded
	}
	if action == "archived" {
		return http.MethodGet, "/admin/knowledge/archive" + suffix
	}
	return http.MethodPost, "/admin/knowledge/nodes/" + url.PathEscape(strings.TrimSpace(nodeID)) + "/" + action + suffix
}
