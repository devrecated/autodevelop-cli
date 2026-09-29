// Copyright (c) 2026 Devrecated.
// GitHub App status and installation tokens for the signed-in profile.
// Never print the token. --account is optional and defaults to the primary.
package github

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/devrecated/autodevelop-cli/internal/credentials"
	"github.com/devrecated/autodevelop-cli/internal/host"
)

type accountRow struct {
	Login   string `json:"login"`
	Primary bool   `json:"primary"`
}

type statusBody struct {
	Connected  bool         `json:"connected"`
	Account    string       `json:"account"`
	Accounts   []accountRow `json:"accounts"`
	URL        string       `json:"url"`
	InstallURL string       `json:"install_url"`
	Error      string       `json:"error"`
}

type tokenBody struct {
	ExpiresAt string `json:"expires_at"`
	Account   string `json:"account"`
	Token     string `json:"token"`
	Error     string `json:"error"`
}

type Options struct {
	Env             map[string]string
	Host            string
	CredentialsPath string
	Profile         string
	Project         string
	Command         string
	Account         string
	NoOpen          bool
	JSON            bool
	Client          *http.Client
	Stdout          io.Writer
	Stderr          io.Writer
	Open            func(string) error
	Sleep           func(time.Duration)
	Now             func() time.Time
}

func Run(opts Options) error {
	if opts.Stdout == nil {
		opts.Stdout = os.Stdout
	}
	if opts.Stderr == nil {
		opts.Stderr = os.Stderr
	}
	if opts.Client == nil {
		opts.Client = &http.Client{Timeout: 20 * time.Second}
	}
	if opts.Sleep == nil {
		opts.Sleep = time.Sleep
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.Open == nil {
		opts.Open = openBrowser
	}
	cmd := strings.TrimSpace(opts.Command)
	switch cmd {
	case "status":
		return runStatus(opts)
	case "token":
		return runToken(opts)
	case "init":
		return runInit(opts)
	default:
		return errors.New("Unknown github command. Use init, status, or token.")
	}
}

func session(opts Options) (origin, token string, err error) {
	path := opts.CredentialsPath
	if path == "" {
		path = credentials.DefaultPath(opts.Env)
	}
	profile, err := credentials.ResolveEffectiveProfile(opts.Env, opts.Profile, path, opts.Project)
	if err != nil {
		return "", "", err
	}
	token = credentials.ReadToken(opts.Env, path, profile)
	if strings.TrimSpace(token) == "" {
		return "", "", errors.New("Not signed in. Run autodevelop login.")
	}
	origin = credentials.ResolveHost(opts.Env, opts.Host, path, profile)
	return origin, token, nil
}

func getJSON(opts Options, path string, dest any) (int, error) {
	origin, token, err := session(opts)
	if err != nil {
		return 0, err
	}
	req, err := http.NewRequest(http.MethodGet, host.Join(origin, path), nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := opts.Client.Do(req)
	if err != nil {
		return 0, host.WrapFetchError(err, origin)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusForbidden {
		return resp.StatusCode, errors.New(host.BillingExpired)
	}
	if json.Unmarshal(raw, dest) != nil && resp.StatusCode >= 400 {
		return resp.StatusCode, errors.New("GitHub request failed.")
	}
	if resp.StatusCode >= 400 {
		var body struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(raw, &body)
		if body.Error != "" {
			return resp.StatusCode, errors.New(body.Error)
		}
		return resp.StatusCode, errors.New("GitHub request failed.")
	}
	return resp.StatusCode, nil
}

func runStatus(opts Options) error {
	var status statusBody
	if _, err := getJSON(opts, "/cli/github", &status); err != nil {
		return err
	}
	if opts.JSON {
		enc, _ := json.Marshal(map[string]any{
			"connected": status.Connected,
			"account":   status.Account,
			"accounts":  status.Accounts,
		})
		fmt.Fprintln(opts.Stdout, string(enc))
		return nil
	}
	if !status.Connected {
		fmt.Fprintln(opts.Stdout, "GitHub App is not connected. Run autodevelop github init.")
		return nil
	}
	fmt.Fprintf(opts.Stdout, "GitHub App primary is %s.\n", orConnected(status.Account))
	var extra []string
	for _, row := range status.Accounts {
		if row.Login != "" && !row.Primary {
			extra = append(extra, row.Login)
		}
	}
	if len(extra) > 0 {
		fmt.Fprintf(opts.Stdout, "Also linked: %s.\n", strings.Join(extra, ", "))
	}
	return nil
}

func runToken(opts Options) error {
	path := "/cli/github/token"
	if account := strings.TrimSpace(opts.Account); account != "" {
		path += "?account=" + url.QueryEscape(account)
	}
	var minted tokenBody
	if _, err := getJSON(opts, path, &minted); err != nil {
		return err
	}
	linked := minted.Account
	if linked == "" {
		linked = strings.TrimSpace(opts.Account)
	}
	if linked == "" {
		linked = "connected"
	}
	if opts.JSON {
		enc, _ := json.Marshal(map[string]any{"expires_at": minted.ExpiresAt, "account": linked})
		fmt.Fprintln(opts.Stdout, string(enc))
		return nil
	}
	fmt.Fprintf(opts.Stdout, "GitHub App token expires %s (%s).\n", orUnknown(minted.ExpiresAt), linked)
	fmt.Fprintln(opts.Stdout, "Export GH_TOKEN from this process only. The CLI does not print the token.")
	return nil
}

func flush(w io.Writer) {
	if f, ok := w.(interface{ Sync() error }); ok {
		_ = f.Sync()
	}
}

func runInit(opts Options) error {
	fmt.Fprintln(opts.Stdout, "Checking the GitHub App for this organization.")
	flush(opts.Stdout)
	var current statusBody
	if _, err := getJSON(opts, "/cli/github", &current); err != nil {
		return err
	}
	if current.Connected {
		fmt.Fprintf(opts.Stdout, "GitHub App primary is %s.\n", orConnected(current.Account))
		return nil
	}
	href := strings.TrimSpace(current.InstallURL)
	if href == "" {
		var started statusBody
		if _, err := getJSON(opts, "/cli/github/install-url", &started); err != nil {
			return err
		}
		href = strings.TrimSpace(started.URL)
	}
	if href == "" {
		return errors.New("Host did not return a GitHub App install URL.")
	}
	fmt.Fprintf(opts.Stdout, "Open this page to install the Autodevelop GitHub App:\n%s\n", href)
	flush(opts.Stdout)
	if !opts.NoOpen {
		if err := opts.Open(href); err != nil {
			fmt.Fprintln(opts.Stderr, "Could not open a browser. Open the URL above.")
		}
	}
	deadline := opts.Now().Add(2 * time.Minute)
	for opts.Now().Before(deadline) {
		opts.Sleep(3 * time.Second)
		var status statusBody
		if _, err := getJSON(opts, "/cli/github", &status); err != nil {
			return err
		}
		if status.Connected {
			fmt.Fprintf(opts.Stdout, "GitHub App primary is %s.\n", orConnected(status.Account))
			return nil
		}
	}
	fmt.Fprintln(opts.Stdout, "Install did not finish in this session. Approve it on GitHub, then run autodevelop github status.")
	return nil
}

func orConnected(value string) string {
	if strings.TrimSpace(value) == "" {
		return "connected"
	}
	return value
}

func orUnknown(value string) string {
	if strings.TrimSpace(value) == "" {
		return "unknown"
	}
	return value
}

func openBrowser(href string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", href)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", href)
	default:
		cmd = exec.Command("xdg-open", href)
	}
	return cmd.Start()
}
