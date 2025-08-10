import { WailsEvent } from "@wailsio/runtime/types/events";
import { MCPService } from "../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/mcp";
import { Events } from "@wailsio/runtime";

let serverListDiv = document.getElementById('servers');
let listenAddrDiv = document.getElementById('listen-addr');

async function init() {
  let servers = await MCPService.List()
  for (let server of servers) {
    let serverDiv = document.createElement('div');
    serverDiv.innerHTML = server;
    serverListDiv?.appendChild(serverDiv);
  }

  if (listenAddrDiv) {
    listenAddrDiv.innerHTML = await MCPService.ListenAddr();
  }
}

Events.On("mcp:servers_updated", async (event: WailsEvent) => {
  if (serverListDiv) {
    serverListDiv.innerHTML = '';
  }
  let servers = await MCPService.List()
  for (let server of servers) {
    let serverDiv = document.createElement('div');
    serverDiv.innerHTML = server;
    serverListDiv?.appendChild(serverDiv);
  }
});

async function main() {
  await init();
}
main();
