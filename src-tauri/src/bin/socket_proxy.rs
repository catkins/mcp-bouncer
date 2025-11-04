use std::{env, path::PathBuf, process};

use anyhow::Result;
use mcp_bouncer::socket_proxy;

#[tokio::main]
async fn main() -> Result<()> {
    let cfg = parse_args().unwrap_or_else(|err| {
        eprintln!("error: {err}");
        print_usage_and_exit(1);
    });

    println!(
        "mcp-bouncer-socket-proxy piping stdio ↔ {}{}",
        cfg.socket_path.display(),
        cfg.endpoint
    );

    let stdio = rmcp::transport::io::stdio();

    let shutdown = async {
        if let Err(err) = tokio::signal::ctrl_c().await {
            eprintln!("failed to listen for ctrl_c: {err}");
        }
    };

    socket_proxy::serve_stdio(stdio, cfg.socket_path, &cfg.endpoint, shutdown).await?;
    Ok(())
}

struct Config {
    socket_path: PathBuf,
    endpoint: String,
}

fn parse_args() -> Result<Config, String> {
    let mut socket_path = PathBuf::from("/tmp/mcp-bouncer.sock");
    let mut endpoint = String::from("/mcp");
    let mut args = env::args().skip(1);

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--socket" => {
                let value = args.next().ok_or("--socket requires a path value")?;
                socket_path = PathBuf::from(value);
            }
            "--endpoint" => {
                let value = args.next().ok_or("--endpoint requires a value")?;
                if !value.starts_with('/') {
                    return Err("--endpoint must start with '/'".into());
                }
                endpoint = value;
            }
            "--help" | "-h" => print_usage_and_exit(0),
            other => return Err(format!("unknown argument `{other}`")),
        }
    }

    Ok(Config {
        socket_path,
        endpoint,
    })
}

fn print_usage_and_exit(code: i32) -> ! {
    eprintln!(
        "Usage: mcp-bouncer-socket-proxy [--socket <path>] [--endpoint <path>]\n\
         Defaults: socket=/tmp/mcp-bouncer.sock endpoint=/mcp"
    );
    process::exit(code);
}
