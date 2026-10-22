use anyhow::{ensure, Context, Result};
use rmcp::{model::CallToolRequestParam, ServiceExt};

/// Exercise the same stdio entry point used by desktop clients without returning note content.
pub async fn check() -> Result<()> {
    let mut command = tokio::process::Command::new(std::env::current_exe()?);
    command.kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let mut child = command
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()?;
    let transport = (
        child.stdout.take().context("Missing MCP stdout")?,
        child.stdin.take().context("Missing MCP stdin")?,
    );
    let service = ().serve(transport).await.context("MCP initialization failed")?;
    let result = async {
        let tools = service.list_all_tools().await?;
        ensure!(
            tools.iter().any(|tool| tool.name == "list_sessions"),
            "Missing retrieval tool"
        );
        let result = service
            .call_tool(CallToolRequestParam {
                name: "list_sessions".into(),
                arguments: Some(serde_json::json!({"limit": 1}).as_object().unwrap().clone()),
            })
            .await?;
        ensure!(result.is_error != Some(true), "MCP retrieval failed");
        // Legacy tools return database errors as text; do not mistake those for a connection.
        let text = result
            .content
            .iter()
            .filter_map(|c| c.as_text())
            .map(|c| c.text.as_str())
            .collect::<String>();
        ensure!(
            text.starts_with("# Found ") || text == "No sessions found.",
            "MCP database read failed"
        );
        Ok::<_, anyhow::Error>(())
    }
    .await;
    service.cancel().await?;
    let _ = child.kill().await;
    result
}
