use std::path::{Path, PathBuf};
use tauri_plugin_db::DatabasePluginExt;

pub(super) fn sidecar_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let directory = exe.parent().ok_or("Missing executable directory")?;
    Ok(directory.join(if cfg!(windows) {
        "typr-mcp.exe"
    } else {
        "typr-mcp"
    }))
}

fn codex_config(binary: &Path, database: &Path) -> Result<String, String> {
    // JSON basic strings are also TOML basic strings for filesystem paths.
    let quote = |path: &Path| {
        serde_json::to_string(path.to_str().ok_or("Invalid MCP path")?).map_err(|e| e.to_string())
    };
    Ok(format!("[mcp_servers.typr_local]\ncommand = {}\n\n[mcp_servers.typr_local.env]\nTYPR_DB_PATH = {}\n", quote(binary)?, quote(database)?))
}

#[derive(serde::Serialize)]
pub struct McpSetup {
    claude_json: String,
    codex_toml: String,
}

pub async fn get_ai_mcp_setup<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<McpSetup, String> {
    let binary = sidecar_path()?;
    let database = app.db_local_path().map_err(|e| e.to_string())?;
    let database = Path::new(&database);
    let mut claude = serde_json::json!({});
    super::claude_mcp::configure_server(&mut claude, &binary, database)?;
    Ok(McpSetup {
        claude_json: serde_json::to_string_pretty(&claude).map_err(|e| e.to_string())?,
        codex_toml: codex_config(&binary, database)?,
    })
}

pub async fn check_ai_mcp_connection<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    let database = app.db_local_path().map_err(|e| e.to_string())?;
    let mut command = tokio::process::Command::new(sidecar_path()?);
    command
        .arg("--check")
        .env("TYPR_DB_PATH", database)
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let output = tokio::time::timeout(std::time::Duration::from_secs(15), command.output())
        .await
        .map_err(|_| "MCP_CHECK_TIMEOUT")?
        .map_err(|_| "MCP_BINARY_UNAVAILABLE")?;
    if !output.status.success() {
        return Err("MCP_CHECK_FAILED".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_escapes_paths_and_pins_the_active_database() {
        let config = codex_config(
            Path::new(r"C:\Program Files\Typr\typr-mcp.exe"),
            Path::new(r"C:\Users\Test\db.sqlite"),
        )
        .unwrap();
        assert!(config.contains("[mcp_servers.typr_local.env]"));
        assert!(config.contains(r#"command = "C:\\Program Files\\Typr\\typr-mcp.exe""#));
        assert!(config.contains(r#"TYPR_DB_PATH = "C:\\Users\\Test\\db.sqlite""#));
    }
}
