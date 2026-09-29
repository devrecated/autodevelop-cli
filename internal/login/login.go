// Copyright (c) 2026 Devrecated.
// RFC 8628 device login. Never prints the credential value.
package login

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/devrecated/autodevelop-cli/internal/credentials"
	"github.com/devrecated/autodevelop-cli/internal/host"
)

const DeviceGrantType = "urn:ietf:params:oauth:grant-type:device_code"

type deviceStart struct {
	DeviceCode              string `json:"device_code"`
	UserCode                string `json:"user_code"`
	VerificationURI         string `json:"verification_uri"`
	VerificationURIComplete string `json:"verification_uri_complete"`
	Interval                int    `json:"interval"`
	ExpiresIn               int    `json:"expires_in"`
	Error                   string `json:"error"`
}

type tokenResp struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	OrgID       string `json:"org_id"`
	OrgIdAlt    string `json:"orgId"`
	Error       string `json:"error"`
}

func OpenBrowser(url string) bool {
	url = strings.TrimSpace(url)
	if url == "" {
		return false
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start() == nil
}

func requestDeviceCode(client *http.Client, origin, deviceName string) (*deviceStart, error) {
	body, _ := json.Marshal(map[string]string{"device_name": deviceName})
	resp, err := client.Post(host.Join(origin, "/oauth/device/code"), "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, host.WrapFetchError(err, origin)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var data deviceStart
	_ = json.Unmarshal(raw, &data)
	if resp.StatusCode >= 300 {
		msg := data.Error
		if msg == "" {
			msg = "Could not start device sign-in."
		}
		return nil, fmt.Errorf("%s", msg)
	}
	return &data, nil
}

func pollDeviceToken(client *http.Client, origin, deviceCode string, interval, expiresIn int) (credential string, orgID *string, err error) {
	if interval < 1 {
		interval = 5
	}
	if expiresIn < 1 {
		expiresIn = 600
	}
	deadline := time.Now().Add(time.Duration(expiresIn) * time.Second)
	wait := time.Duration(interval) * time.Second
	for time.Now().Before(deadline) {
		time.Sleep(wait)
		body, _ := json.Marshal(map[string]string{
			"grant_type":  DeviceGrantType,
			"device_code": deviceCode,
		})
		resp, err := client.Post(host.Join(origin, "/oauth/token"), "application/json", bytes.NewReader(body))
		if err != nil {
			return "", nil, host.WrapFetchError(err, origin)
		}
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		var data tokenResp
		_ = json.Unmarshal(raw, &data)
		tok := strings.TrimSpace(data.AccessToken)
		if resp.StatusCode < 300 && tok != "" {
			var org *string
			if data.OrgID != "" {
				org = &data.OrgID
			} else if data.OrgIdAlt != "" {
				org = &data.OrgIdAlt
			}
			return tok, org, nil
		}
		switch data.Error {
		case "authorization_pending":
			continue
		case "slow_down":
			wait += 5 * time.Second
			continue
		case "access_denied":
			return "", nil, fmt.Errorf("This machine was not authorized.")
		case "expired_token":
			return "", nil, fmt.Errorf("The sign-in code expired. Run login again.")
		default:
			if data.Error != "" {
				return "", nil, fmt.Errorf("%s", data.Error)
			}
			return "", nil, fmt.Errorf("Sign-in did not complete.")
		}
	}
	return "", nil, fmt.Errorf("The sign-in code expired. Run login again.")
}

type Options struct {
	Env             map[string]string
	Host            string
	CredentialsPath string
	Profile         string
	NoOpen          bool
	Client          *http.Client
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
	path := opts.CredentialsPath
	if path == "" {
		path = credentials.DefaultPath(opts.Env)
	}
	origin := credentials.ResolveHost(opts.Env, opts.Host, path, opts.Profile)
	deviceName, _ := os.Hostname()
	started, err := requestDeviceCode(opts.Client, origin, deviceName)
	if err != nil {
		return err
	}
	opts.Write(fmt.Sprintf("Open this page to authorize this machine:\n%s\n", started.VerificationURIComplete))
	opts.Write(fmt.Sprintf("Or visit %s and enter %s\n", started.VerificationURI, started.UserCode))
	if !opts.NoOpen {
		if !OpenBrowser(started.VerificationURIComplete) {
			opts.Write("Could not open a browser. Open the URL above.\n")
		}
	}
	tok, orgID, err := pollDeviceToken(opts.Client, origin, started.DeviceCode, started.Interval, started.ExpiresIn)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	hostCopy := origin
	if err := credentials.WriteFile(path, tok, orgID, &now, &hostCopy, opts.Profile, opts.Env); err != nil {
		return err
	}
	opts.Write("Signed in. Credentials stored on this machine.\n")
	return nil
}
