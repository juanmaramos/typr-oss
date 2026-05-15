use tauri_plugin_windows::TyprWindow;

#[derive(Debug)]
pub struct Destination {
    pub window: TyprWindow,
    pub url: String,
}

impl Default for Destination {
    fn default() -> Self {
        Self {
            window: TyprWindow::Main,
            url: "/app/new?record=false".to_string(),
        }
    }
}

pub fn parse(url: String) -> Vec<Destination> {
    let parsed_url = match url::Url::parse(&url) {
        Ok(url) => url,
        Err(_) => {
            return vec![Destination::default()];
        }
    };

    let dests = match parsed_url.path() {
        // Specified in notification related codebase
        "/notification" => parse_notification_query(&parsed_url),
        // Optional local provider setup link.
        "/register" => parse_register_query(&parsed_url),
        "/license" => parse_license_query(&parsed_url),
        _ => vec![Destination::default()],
    };

    tracing::info!("deeplink: {:?}", dests);
    dests
}

fn parse_notification_query(parsed_url: &url::Url) -> Vec<Destination> {
    let url = match parsed_url.query() {
        Some(query) => match serde_qs::from_str::<NotificationQuery>(query) {
            Ok(params) => {
                if let Some(event_id) = params.event_id {
                    format!("/app/note/event/{}", event_id)
                } else {
                    "/app/new?record=true".to_string()
                }
            }
            Err(_) => "/app/new?record=true".to_string(),
        },
        None => "/app/new?record=false".to_string(),
    };

    vec![Destination {
        window: TyprWindow::Main,
        url,
    }]
}

fn parse_register_query(parsed_url: &url::Url) -> Vec<Destination> {
    let url = match parsed_url.query() {
        Some(query) => match serde_qs::from_str::<RegisterQuery>(query) {
            Ok(params) => format!(
                "/app?settingsDialog=true&settingsTab=ai&baseUrl={}&apiKey={}",
                params.base_url, params.api_key
            ),
            Err(_) => "/app?settingsDialog=true&settingsTab=ai".to_string(),
        },
        None => "/app?settingsDialog=true&settingsTab=ai".to_string(),
    };

    vec![Destination {
        window: TyprWindow::Main,
        url,
    }]
}

fn parse_license_query(parsed_url: &url::Url) -> Vec<Destination> {
    let _ = parsed_url;
    let url = "/app?settingsDialog=true&settingsTab=ai".to_string();

    vec![Destination {
        window: TyprWindow::Main,
        url,
    }]
}

#[derive(serde::Serialize, serde::Deserialize)]
struct NotificationQuery {
    event_id: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct RegisterQuery {
    base_url: String,
    api_key: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_register_query() {
        let url = "typross://typr.com/register?base_url=http://localhost:3000&api_key=123";

        let dests = parse(url.to_string());
        assert_eq!(dests.len(), 1);

        let dest = dests.first().unwrap();
        assert_eq!(dest.window, TyprWindow::Main);
        assert_eq!(
            dest.url,
            "/app?settingsDialog=true&settingsTab=ai&baseUrl=http://localhost:3000&apiKey=123"
        );
    }

    #[test]
    fn test_parse_license_query() {
        let url = "typross://typr.com/license";

        let dests = parse(url.to_string());
        assert_eq!(dests.len(), 1);

        let dest = dests.first().unwrap();
        assert_eq!(dest.window, TyprWindow::Main);
        assert_eq!(dest.url, "/app?settingsDialog=true&settingsTab=ai");
    }
}
