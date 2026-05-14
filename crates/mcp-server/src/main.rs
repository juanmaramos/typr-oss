mod db;
mod formatters;
mod tools;

use anyhow::Result;
use tokio::io::{stdin, stdout};

#[tokio::main]
async fn main() -> Result<()> {
    // CRITICAL: Never use println! - it writes to stdout and breaks JSON-RPC
    // Use eprintln! for logging instead
    eprintln!("Starting Typr MCP server...");

    // Open local database
    let db = db::open_local_db().await?;
    eprintln!("Database opened successfully");

    // Create and run MCP server
    let server = tools::TyprMcp::new(db);
    let transport = (stdin(), stdout());

    eprintln!("MCP server ready, waiting for connections...");
    use rmcp::ServiceExt;
    let service = server.serve(transport).await?;
    service.waiting().await?;

    Ok(())
}
