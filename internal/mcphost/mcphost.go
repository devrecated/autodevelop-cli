// Copyright (c) 2026 Devrecated.
// Stdio MCP that forwards JSON-RPC to the Autodevelop host.
package mcphost

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/devrecated/autodevelop-cli/internal/credentials"
	"github.com/devrecated/autodevelop-cli/internal/host"
)

func rpcError(id any, message string) map[string]any {
	return map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"error":   map[string]any{"code": -32000, "message": message},
	}
}

func Post(client *http.Client, origin, credential string, message map[string]any) (map[string]any, error) {
	id := message["id"]
	if strings.TrimSpace(credential) == "" {
		return rpcError(id, "Not signed in. Run autodevelop login."), nil
	}
	body, err := json.Marshal(message)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, host.Join(origin, "/mcp"), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+credential)
	resp, err := client.Do(req)
	if err != nil {
		return nil, host.WrapFetchError(err, origin)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var data map[string]any
	if json.Unmarshal(raw, &data) == nil && data["jsonrpc"] == "2.0" {
		return data, nil
	}
	if resp.StatusCode == 403 {
		return rpcError(id, host.BillingExpired), nil
	}
	return rpcError(id, "Host MCP request failed."), nil
}

type Options struct {
	Env             map[string]string
	Host            string
	CredentialsPath string
	Client          *http.Client
	Stdin           io.Reader
	Stdout          io.Writer
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
	if opts.Stdin == nil {
		opts.Stdin = os.Stdin
	}
	if opts.Stdout == nil {
		opts.Stdout = os.Stdout
	}
	path := opts.CredentialsPath
	if path == "" {
		path = credentials.DefaultPath(opts.Env)
	}
	stored := credentials.ReadFile(path, opts.Env, "")
	var storedHost string
	if stored != nil && stored.Host != nil {
		storedHost = *stored.Host
	}
	origin := host.Origin(opts.Env, opts.Host, storedHost)
	sc := bufio.NewScanner(opts.Stdin)
	// Allow large MCP payloads.
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, 10*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var message map[string]any
		if json.Unmarshal([]byte(line), &message) != nil {
			continue
		}
		if message["jsonrpc"] != "2.0" {
			continue
		}
		if message["id"] == nil {
			continue
		}
		credential := credentials.ReadToken(opts.Env, path, "")
		reply, err := Post(opts.Client, origin, credential, message)
		if err != nil {
			return err
		}
		raw, _ := json.Marshal(reply)
		fmt.Fprintf(opts.Stdout, "%s\n", raw)
	}
	return sc.Err()
}
