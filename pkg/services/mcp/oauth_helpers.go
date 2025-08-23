package mcp

import (
	"log/slog"
	"net/http"
	"os/exec"
	"runtime"
)

// startOAuthCallbackServer starts a local HTTP server for OAuth redirect handling
func startOAuthCallbackServer(callbackChan chan<- map[string]string) *http.Server {
	server := &http.Server{Addr: ":8085"}
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
	server.Handler = mux

	go func() {
		if err := server.ListenAndServe(); err != nil && err.Error() != "http: Server closed" {
			slog.Error("OAuth callback server error", "error", err)
		}
	}()

	return server
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
