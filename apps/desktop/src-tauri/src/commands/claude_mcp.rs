use serde_json::{json, Map, Value};
use std::path::Path;

const CONNECTOR_NAME: &str = "Typr Local";
const NAME_CONFLICT: &str = "CLAUDE_MCP_NAME_CONFLICT";
const SETTINGS_CONFLICT: &str = "CLAUDE_MCP_SETTINGS_CONFLICT";

fn is_local_name(name: &str) -> bool {
    name.eq_ignore_ascii_case(CONNECTOR_NAME)
}

// Recognize old sidecar locations even when an app update has moved the binary.
fn sidecar_command(server: &Value) -> Option<&Path> {
    let path = Path::new(server.get("command")?.as_str()?);
    (path.is_absolute() && matches!(path.file_name()?.to_str()?, "typr-mcp" | "typr-mcp.exe"))
        .then_some(path)
}

pub(super) fn is_owned_server(name: &str, server: &Value) -> bool {
    (is_local_name(name) || name.eq_ignore_ascii_case("typr")) && sidecar_command(server).is_some()
}

fn non_owned_settings(server: &Value) -> Result<Value, String> {
    let mut settings = server
        .as_object()
        .ok_or("Typr MCP config is not an object")?
        .clone();
    settings.remove("command");
    if let Some(env) = settings.get_mut("env") {
        let env = env.as_object_mut().ok_or("Typr MCP env is not an object")?;
        env.remove("TYPR_DB_PATH");
        if env.is_empty() {
            settings.remove("env");
        }
    }
    Ok(Value::Object(settings))
}

pub(super) fn configure_server(
    config: &mut Value,
    binary: &Path,
    database: &Path,
) -> Result<(), String> {
    let config = config
        .as_object_mut()
        .ok_or("Claude config root is not an object")?;
    let mut servers = match config.get("mcpServers") {
        None => Map::new(),
        Some(Value::Object(servers)) => servers.clone(),
        Some(_) => return Err("mcpServers is not an object".to_string()),
    };
    if servers
        .iter()
        .any(|(name, server)| is_local_name(name) && sidecar_command(server).is_none())
    {
        return Err(NAME_CONFLICT.to_string());
    }
    let owned: Vec<_> = servers
        .iter()
        .filter(|(name, server)| is_owned_server(name, server))
        .collect();
    let template = owned
        .iter()
        .find(|(name, _)| is_local_name(name))
        .or_else(|| owned.first());
    let mut server = template
        .map(|(_, server)| (*server).clone())
        .unwrap_or_else(|| json!({}));
    let settings = non_owned_settings(&server)?;
    for (_, entry) in &owned {
        if non_owned_settings(entry)? != settings {
            return Err(SETTINGS_CONFLICT.to_string());
        }
    }
    let keys: Vec<_> = owned.iter().map(|(name, _)| (*name).clone()).collect();
    let server = server
        .as_object_mut()
        .ok_or("Typr MCP config is not an object")?;
    server.insert(
        "command".to_string(),
        json!(binary.to_str().ok_or("Invalid MCP binary path")?),
    );
    let env = server
        .entry("env")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or("Typr MCP env is not an object")?;
    env.insert(
        "TYPR_DB_PATH".to_string(),
        json!(database.to_str().ok_or("Invalid database path")?),
    );
    let server = Value::Object(server.clone());
    for key in keys {
        servers.remove(&key);
    }
    servers.insert(CONNECTOR_NAME.to_string(), server);
    config.insert("mcpServers".to_string(), Value::Object(servers));
    Ok(())
}

// Configuration cannot prove whether Claude has loaded this server or enabled its tools.
pub(super) fn is_configured(config: &Value, database: &Path) -> bool {
    let Some(servers) = config.get("mcpServers").and_then(Value::as_object) else {
        return false;
    };
    let mut local_servers = servers
        .iter()
        .filter(|(name, _)| is_local_name(name))
        .peekable();
    local_servers.peek().is_some()
        && local_servers.all(|(_, server)| {
            let Some(Value::String(path)) = server.pointer("/env/TYPR_DB_PATH") else {
                return false;
            };
            if Path::new(path) != database {
                return false;
            }
            let Some(binary) = sidecar_command(server) else {
                return false;
            };
            let Ok(metadata) = binary.metadata() else {
                return false;
            };
            if !metadata.is_file() {
                return false;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if metadata.permissions().mode() & 0o111 == 0 {
                    return false;
                }
            }
            true
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requires_a_usable_local_sidecar_and_unambiguous_current_database() {
        let directory = std::env::temp_dir().join(format!(
            "typr-claude-status-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let binary = directory.join("typr-mcp");
        let database = directory.join("development/db.sqlite");
        std::fs::write(&binary, b"test fixture").unwrap();
        let mut config = json!({"mcpServers": {"Typr Local": {"command": binary, "env": {"TYPR_DB_PATH": database}}}});
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert!(!is_configured(&config, &database));
            std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        assert!(is_configured(&config, &database));
        for sibling in [
            json!({"command": binary, "env": {"TYPR_DB_PATH": "/production/db.sqlite"}}),
            json!({"command": binary}),
            json!({"command": "/missing/typr-mcp", "env": {"TYPR_DB_PATH": database}}),
        ] {
            config["mcpServers"]["typr local"] = sibling;
            assert!(!is_configured(&config, &database));
            configure_server(&mut config, &binary, &database).unwrap();
            assert!(is_configured(&config, &database));
        }
        for invalid in [
            json!({}),
            json!({"mcpServers": []}),
            json!({"mcpServers": {"Typr": {"command": binary, "env": {"TYPR_DB_PATH": database}}}}),
            json!({"mcpServers": {"Typr Local": {"command": "typr-mcp", "env": {"TYPR_DB_PATH": database}}}}),
            json!({"mcpServers": {"Typr Local": {"command": directory, "env": {"TYPR_DB_PATH": database}}}}),
            json!({"mcpServers": {"Typr Local": {"command": binary, "env": {"TYPR_DB_PATH": 123}}}}),
        ] {
            assert!(!is_configured(&invalid, &database));
        }
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn explicit_setup_migrates_only_owned_entries_and_preserves_custom_settings() {
        let mut config = json!({"preferences": {"theme": "dark"}, "mcpServers": {
            "Other": {"command": "/other", "env": {"TOKEN": "fixture"}},
            "Typr": {"command": "/old/typr-mcp", "args": [], "env": {"KEEP": "fixture"}},
            "typr": {"command": "/foreign/server"}
        }});
        let original = config.clone();
        configure_server(
            &mut config,
            Path::new("/new/typr-mcp"),
            Path::new("/development/db.sqlite"),
        )
        .unwrap();
        assert_eq!(config["preferences"], original["preferences"]);
        for name in ["Other", "typr"] {
            assert_eq!(config["mcpServers"][name], original["mcpServers"][name]);
        }
        assert!(config["mcpServers"].get("Typr").is_none());
        assert_eq!(
            config["mcpServers"][CONNECTOR_NAME],
            json!({"command": "/new/typr-mcp", "args": [], "env": {"KEEP": "fixture", "TYPR_DB_PATH": "/development/db.sqlite"}})
        );
        assert!(is_owned_server(
            CONNECTOR_NAME,
            &config["mcpServers"][CONNECTOR_NAME]
        ));
        assert!(!is_owned_server("typr", &config["mcpServers"]["typr"]));
    }

    #[test]
    fn setup_rejects_foreign_name_collisions_or_conflicting_settings_without_modifying_config() {
        for (mut config, expected) in [
            (
                json!({"mcpServers": {"typr local": {"command": "/foreign/server"}}}),
                NAME_CONFLICT,
            ),
            (
                json!({"mcpServers": {"Typr": {"command": "/old/typr-mcp", "env": {"KEEP": "first"}}, "typr": {"command": "/other/typr-mcp", "env": {"KEEP": "different"}}}}),
                SETTINGS_CONFLICT,
            ),
        ] {
            let original = config.clone();
            assert_eq!(
                configure_server(
                    &mut config,
                    Path::new("/new/typr-mcp"),
                    Path::new("/development/db.sqlite")
                )
                .unwrap_err(),
                expected
            );
            assert_eq!(config, original);
        }
        let mut empty = json!({});
        configure_server(
            &mut empty,
            Path::new("/new/typr-mcp"),
            Path::new("/development/db.sqlite"),
        )
        .unwrap();
        assert_eq!(
            empty["mcpServers"][CONNECTOR_NAME]["env"]["TYPR_DB_PATH"],
            "/development/db.sqlite"
        );
        for mut invalid in [json!([]), json!({"mcpServers": []})] {
            assert!(configure_server(
                &mut invalid,
                Path::new("/new/typr-mcp"),
                Path::new("/development/db.sqlite")
            )
            .is_err());
        }
    }
}
