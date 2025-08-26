package mcp

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os/exec"
	"runtime"
)

// startOAuthCallbackServer starts a local HTTP server for OAuth redirect handling on a free port.
// It returns the server instance and the redirect URI to configure the OAuth flow.
func startOAuthCallbackServer(callbackChan chan<- map[string]string) (*http.Server, string, error) {
	// Bind to a free port on loopback
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, "", fmt.Errorf("failed to bind oauth callback listener: %w", err)
	}

	addr := listener.Addr().String() // host:port
	redirectURI := fmt.Sprintf("http://%s/oauth/callback", addr)

	httpServer := &http.Server{Addr: addr}
	mux := http.NewServeMux()
	mux.HandleFunc("/oauth/callback", func(w http.ResponseWriter, r *http.Request) {
		params := make(map[string]string)
		for key, values := range r.URL.Query() {
			if len(values) > 0 {
				params[key] = values[0]
			}
		}
		callbackChan <- params
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`
      <html>
        <body>
          <h1>Authorization Successful</h1>
          <p>You can now close this window and return to the application.</p>
          <script>window.close();</script>
        </body>
      </html>
    `))
	})
	httpServer.Handler = mux

	go func() {
		if err := httpServer.Serve(listener); err != nil && errors.Is(err, http.ErrServerClosed) {
			slog.Error("OAuth callback server error", "error", err)
		}
	}()

	return httpServer, redirectURI, nil
}

// openDefaultBrowser opens the system browser to a URL
func openDefaultBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}
