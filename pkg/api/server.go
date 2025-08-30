package api

import (
	"net/http"

	"github.com/catkins/mcp-bouncer/pkg/services/mcp"
	"github.com/catkins/mcp-bouncer/pkg/services/settings"
	"github.com/catkins/mcp-bouncer/pkg/services/settings/models"
	"github.com/labstack/echo/v4"
)

type APIServer struct {
	mcpService      *mcp.MCPService
	settingsService *settings.SettingsService
	echo            *echo.Echo
}

func NewAPIServer(mcpService *mcp.MCPService, settingsService *settings.SettingsService) *APIServer {
	e := echo.New()
	s := &APIServer{
		mcpService:      mcpService,
		settingsService: settingsService,
		echo:            e,
	}
	s.registerRoutes()
	return s
}

func (s *APIServer) Start() {
	s.echo.Logger.Fatal(s.echo.Start(":8080"))
}

func (s *APIServer) registerRoutes() {
	api := s.echo.Group("/api")
	mcpGroup := api.Group("/mcp")
	mcpGroup.GET("/servers", s.listMCPServers)
	mcpGroup.POST("/servers", s.addMCPServer)
	mcpGroup.PUT("/servers/:name", s.updateMCPServer)
	mcpGroup.DELETE("/servers/:name", s.removeMCPServer)
	mcpGroup.POST("/servers/:name/restart", s.restartClient)
	mcpGroup.POST("/servers/:name/authorize", s.authorizeClient)
	mcpGroup.GET("/listen-addr", s.listenAddr)
	mcpGroup.GET("/is-active", s.isActive)
	mcpGroup.GET("/client-status", s.getClientStatus)

	settingsGroup := api.Group("/settings")
	settingsGroup.GET("", s.getSettings)
	settingsGroup.POST("/open-config-directory", s.openConfigDirectory)
}

func (s *APIServer) listMCPServers(c echo.Context) error {
	servers, err := s.mcpService.List()
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, servers)
}

func (s *APIServer) addMCPServer(c echo.Context) error {
	var config models.MCPServerConfig
	if err := c.Bind(&config); err != nil {
		return c.String(http.StatusBadRequest, err.Error())
	}
	if err := s.mcpService.AddMCPServer(config); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusCreated)
}

func (s *APIServer) updateMCPServer(c echo.Context) error {
	serverName := c.Param("name")
	var config models.MCPServerConfig
	if err := c.Bind(&config); err != nil {
		return c.String(http.StatusBadRequest, err.Error())
	}
	if err := s.mcpService.UpdateMCPServer(serverName, config); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (s *APIServer) removeMCPServer(c echo.Context) error {
	serverName := c.Param("name")
	if err := s.mcpService.RemoveMCPServer(serverName); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (s *APIServer) restartClient(c echo.Context) error {
	serverName := c.Param("name")
	if err := s.mcpService.RestartClient(serverName); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (s *APIServer) authorizeClient(c echo.Context) error {
	serverName := c.Param("name")
	if err := s.mcpService.AuthorizeClient(serverName); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (s *APIServer) listenAddr(c echo.Context) error {
	addr, err := s.mcpService.ListenAddr()
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, addr)
}

func (s *APIServer) isActive(c echo.Context) error {
	active := s.mcpService.IsActive()
	return c.JSON(http.StatusOK, active)
}

func (s *APIServer) getClientStatus(c echo.Context) error {
	status, err := s.mcpService.GetClientStatus()
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, status)
}

func (s *APIServer) getSettings(c echo.Context) error {
	settings, err := s.settingsService.GetSettings()
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, settings)
}

func (s *APIServer) openConfigDirectory(c echo.Context) error {
	if err := s.settingsService.OpenConfigDirectory(); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}
