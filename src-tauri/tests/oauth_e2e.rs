use std::sync::Arc;

use axum::{
    extract::Query,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use rmcp::transport::{
    auth::{OAuthState, OAuthTokenResponse},
    streamable_http_client::StreamableHttpClient,
};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;

#[derive(Deserialize)]
struct AuthQuery {
    redirect_uri: String,
    state: Option<String>,
}

#[tokio::test]
async fn end_to_end_oauth_flow_with_streamable_http() {
    // Channel to capture auth headers seen by /mcp endpoint
    let (tx, mut rx) = mpsc::channel::<String>(1);

    // In-process OAuth + MCP server
    let app = Router::new()
        // metadata discovery
        .route(
            "/.well-known/oauth-authorization-server",
            get(|| async {
                Json(json!({
                    "authorization_endpoint": "/oauth/authorize",
                    "token_endpoint": "/oauth/token",
                }))
            }),
        )
        // authorization endpoint -> redirect back with code
        .route(
            "/oauth/authorize",
            get(|Query(q): Query<AuthQuery>| async move {
                let mut uri = reqwest::Url::parse(&q.redirect_uri).unwrap();
                uri.query_pairs_mut()
                    .append_pair("code", "test-code")
                    .append_pair("state", q.state.as_deref().unwrap_or(""));
                (StatusCode::FOUND, [("Location", uri.to_string())]).into_response()
            }),
        )
        // exchange code for token
        .route(
            "/oauth/token",
            post(|| async move {
                Json(json!({
                    "access_token": "e2e-token",
                    "token_type": "Bearer",
                    "refresh_token": "e2e-refresh"
                }))
            }),
        )
        // streamable http endpoint; require bearer token
        .route(
            "/mcp",
            post({
                let tx = tx.clone();
                move |headers: HeaderMap, _body: String| {
                    let tx = tx.clone();
                    async move {
                        match headers.get("Authorization").and_then(|v| v.to_str().ok()) {
                            Some(val) if val.starts_with("Bearer ") => {
                                let _ = tx.send(val.to_string()).await;
                                (
                                    StatusCode::OK,
                                    Json(json!({"jsonrpc":"2.0","id":1,"result":{}})),
                                )
                                .into_response()
                            }
                            _ => (StatusCode::UNAUTHORIZED, "unauthorized").into_response(),
                        }
                    }
                }
            }),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Build OAuth state and callback server
    let base = format!("http://{}", addr);
    let mut state = OAuthState::new(&base, None).await.unwrap();

    // callback listener
    let cb_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let cb_addr = cb_listener.local_addr().unwrap();
    let redirect_uri = format!("http://{}/callback", cb_addr);

    state
        .start_authorization(&["mcp"], &redirect_uri)
        .await
        .unwrap();
    let auth_url = state.get_authorization_url().await.unwrap();

    // Minimal callback server to capture code and complete flow
    let (done_tx, done_rx) = tokio::sync::oneshot::channel::<()>();
    tokio::spawn(async move {
        let app = Router::new().route(
            "/callback",
            get(|Query(params): Query<std::collections::HashMap<String, String>>| async move {
                (StatusCode::OK, format!("ok: {:?}", params))
            }),
        );
        axum::serve(cb_listener, app).await.unwrap();
        let _ = done_tx.send(());
    });

    // Simulate browser: GET auth URL to follow redirect into our callback server
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let resp = client.get(&format!("{}{}", base, auth_url)).send().await.unwrap();
    assert_eq!(resp.status(), StatusCode::FOUND);
    let loc = resp.headers().get("Location").unwrap().to_str().unwrap();
    // Call the redirected URL (our callback)
    let _ = reqwest::get(loc).await.unwrap();
    let _ = done_rx.await;

    // Extract code from callback URL
    let url = reqwest::Url::parse(loc).unwrap();
    let code = url
        .query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.to_string())
        .unwrap();

    state.handle_callback(&code).await.unwrap();
    let _ = state.get_credentials().await.unwrap();

    // Use authorized client to post a message to /mcp
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
    let uri: Arc<str> = format!("{}/mcp", base).into();

    // Convert state into manager + client
    let manager = state.into_authorization_manager().unwrap();
    let auth_client = rmcp::transport::auth::AuthClient::new(reqwest::Client::new(), manager);
    StreamableHttpClient::post_message(&auth_client, uri, msg, None, None)
        .await
        .unwrap();

    // Server observed bearer header
    let received = rx.recv().await.unwrap();
    assert!(received.starts_with("Bearer "));
}
