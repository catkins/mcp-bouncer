use std::sync::Arc;

use axum::{
    Json, Router,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use rmcp::transport::{
    auth::{AuthClient, OAuthState, OAuthTokenResponse},
    streamable_http_client::StreamableHttpClient,
};
use serde_json::json;
use tokio::sync::mpsc;

#[tokio::test]
async fn auth_client_attaches_bearer_header() {
    let (tx, mut rx) = mpsc::channel::<String>(1);

    let app = Router::new()
        .route(
            "/.well-known/oauth-authorization-server",
            get(|| async {
                Json(json!({
                    "authorization_endpoint": "http://localhost/auth",
                    "token_endpoint": "http://localhost/token",
                    "registration_endpoint": "http://localhost/register"
                }))
            }),
        )
        .route(
            "/mcp",
            post({
                let tx = tx.clone();
                move |headers: HeaderMap, _body: String| {
                    let tx = tx.clone();
                    async move {
                        let auth = headers
                            .get("Authorization")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or_default()
                            .to_string();
                        tx.send(auth).await.unwrap();
                        (
                            StatusCode::OK,
                            Json(json!({"jsonrpc":"2.0","id":1,"result":{}})),
                        )
                    }
                }
            }),
        );

    let listener = match tokio::net::TcpListener::bind("127.0.0.1:0").await {
        Ok(l) => l,
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            eprintln!("skipping auth_client_attaches_bearer_header: {err}");
            return;
        }
        Err(err) => panic!("failed to bind oauth transport listener: {err}"),
    };
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    let base = format!("http://{addr}");
    let mut state = OAuthState::new(&base, None).await.unwrap();
    let credentials: OAuthTokenResponse = serde_json::from_value(json!({
        "access_token": "secret",
        "token_type": "Bearer"
    }))
    .unwrap();
    state.set_credentials("client", credentials).await.unwrap();
    let manager = state.into_authorization_manager().unwrap();
    let client = AuthClient::new(reqwest::Client::new(), manager);

    use rmcp::model::{
        ClientJsonRpcMessage, ClientRequest, ListToolsRequestMethod, NumberOrString,
        RequestOptionalParam,
    };
    let req = ClientRequest::ListToolsRequest(RequestOptionalParam {
        method: ListToolsRequestMethod,
        params: None,
        extensions: Default::default(),
    });
    let msg = ClientJsonRpcMessage::request(req, NumberOrString::Number(1));
    let uri: Arc<str> = format!("{base}/mcp").into();
    StreamableHttpClient::post_message(&client, uri, msg, None, None)
        .await
        .unwrap();

    let received = rx.recv().await.unwrap();
    assert_eq!(received, "Bearer secret");
}
