use std::sync::Arc;

use axum::{
    Json, Router,
    extract::Query,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use rmcp::transport::{auth::OAuthState, streamable_http_client::StreamableHttpClient};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;
use tokio::time::{Duration, timeout};

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
    // Bind listener first so we can build absolute metadata URLs
    let listener = match tokio::net::TcpListener::bind("127.0.0.1:0").await {
        Ok(l) => l,
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            eprintln!("skipping end_to_end_oauth_flow_with_streamable_http: {err}");
            return;
        }
        Err(err) => panic!("failed to bind oauth test listener: {err}"),
    };
    let addr = listener.local_addr().unwrap();
    let base = format!("http://{addr}");

    let app = Router::new()
        // metadata discovery
        .route(
            "/.well-known/oauth-authorization-server",
            get({
                let base = base.clone();
                move || {
                    let base = base.clone();
                    async move {
                        Json(json!({
                            "authorization_endpoint": format!("{}/oauth/authorize", base),
                            "token_endpoint": format!("{}/oauth/token", base),
                            "registration_endpoint": format!("{}/oauth/register", base),
                        }))
                    }
                }
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
        // dynamic client registration endpoint
        .route(
            "/oauth/register",
            post(|| async move {
                Json(json!({
                    "client_id": "test-client",
                    "client_name": "test-client",
                    "redirect_uris": ["http://127.0.0.1/callback"],
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

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Build OAuth state and callback server
    let mut state = timeout(Duration::from_secs(5), OAuthState::new(&base, None))
        .await
        .expect("OAuthState::new timed out")
        .unwrap();

    // callback listener
    let cb_listener = match tokio::net::TcpListener::bind("127.0.0.1:0").await {
        Ok(l) => l,
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            eprintln!("skipping end_to_end_oauth_flow_with_streamable_http: {err}");
            return;
        }
        Err(err) => panic!("failed to bind oauth callback listener: {err}"),
    };
    let cb_addr = cb_listener.local_addr().unwrap();
    let redirect_uri = format!("http://{cb_addr}/callback");

    timeout(
        Duration::from_secs(5),
        state.start_authorization(&["mcp"], &redirect_uri, Some("mcp-bouncer")),
    )
    .await
    .expect("start_authorization timed out")
    .unwrap();
    let auth_url = timeout(Duration::from_secs(5), state.get_authorization_url())
        .await
        .expect("get_authorization_url timed out")
        .unwrap();

    // Minimal callback server to capture code; run detached for the duration of the test
    tokio::spawn(async move {
        let app = Router::new().route(
            "/callback",
            get(
                |Query(params): Query<std::collections::HashMap<String, String>>| async move {
                    (StatusCode::OK, format!("ok: {params:?}"))
                },
            ),
        );
        let _ = axum::serve(cb_listener, app).await;
    });

    // Simulate browser: GET auth URL to follow redirect into our callback server
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let full_auth_url = if auth_url.starts_with("http://") || auth_url.starts_with("https://") {
        auth_url
    } else {
        format!("{base}{auth_url}")
    };
    let resp = timeout(Duration::from_secs(5), client.get(&full_auth_url).send())
        .await
        .expect("auth request timed out")
        .unwrap();
    assert_eq!(resp.status(), StatusCode::FOUND);
    let loc = resp.headers().get("Location").unwrap().to_str().unwrap();
    // Call the redirected URL (our callback)
    let _ = timeout(Duration::from_secs(5), reqwest::get(loc))
        .await
        .expect("callback GET timed out")
        .unwrap();
    // Do not wait for server shutdown; continue once callback responds

    // Extract code from callback URL
    let url = reqwest::Url::parse(loc).unwrap();
    let mut code = None;
    let mut csrf = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.to_string()),
            "state" => csrf = Some(value.to_string()),
            _ => {}
        }
    }
    let code = code.expect("callback missing code param");
    let csrf = csrf.expect("callback missing state param");

    timeout(Duration::from_secs(5), state.handle_callback(&code, &csrf))
        .await
        .expect("handle_callback timed out")
        .unwrap();
    let _ = timeout(Duration::from_secs(5), state.get_credentials())
        .await
        .expect("get_credentials timed out")
        .unwrap();

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
    let uri: Arc<str> = format!("{base}/mcp").into();

    // Convert state into manager + client
    let manager = state.into_authorization_manager().unwrap();
    let auth_client = rmcp::transport::auth::AuthClient::new(reqwest::Client::new(), manager);
    timeout(
        Duration::from_secs(5),
        StreamableHttpClient::post_message(&auth_client, uri, msg, None, None),
    )
    .await
    .expect("post_message timed out")
    .unwrap();

    // Server observed bearer header
    let received = rx.recv().await.unwrap();
    assert!(received.starts_with("Bearer "));
}
