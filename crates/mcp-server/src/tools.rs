use typr_db_user::{GetSessionFilter, UserDatabase};
use rmcp::{
    handler::server::tool::Parameters, model::*, tool, tool_handler, tool_router, ServerHandler,
};
use std::future::Future;

use crate::formatters;

pub struct TyprMcp {
    db: UserDatabase,
    tool_router: rmcp::handler::server::router::tool::ToolRouter<TyprMcp>,
}

#[tool_router]
impl TyprMcp {
    pub fn new(db: UserDatabase) -> Self {
        Self {
            db,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "List recent meeting sessions. Returns session titles, IDs, dates. Use this to discover which meetings exist before fetching details."
    )]
    async fn list_sessions(&self, Parameters(req): Parameters<ListSessionsRequest>) -> String {
        eprintln!("MCP call: list_sessions(limit={})", req.limit);

        match self.db.list_sessions(None).await {
            Ok(mut sessions) => {
                // Manual limit since API doesn't support it
                sessions.truncate(req.limit);
                eprintln!("Found {} sessions", sessions.len());
                formatters::sessions_to_markdown(sessions)
            }
            Err(e) => {
                eprintln!("Error listing sessions: {:?}", e);
                format!("Error listing sessions: {}", e)
            }
        }
    }

    #[tool(
        description = "Get full details for a specific session including title, date, summary. Use the session ID from list_sessions."
    )]
    async fn get_session(&self, Parameters(req): Parameters<GetSessionRequest>) -> String {
        eprintln!("MCP call: get_session(id={})", req.id);

        match self
            .db
            .get_session(GetSessionFilter::Id(req.id.clone()))
            .await
        {
            Ok(Some(session)) => {
                eprintln!("Found session: {}", session.title);
                formatters::session_detail_to_markdown(session)
            }
            Ok(None) => {
                eprintln!("Session not found: {}", req.id);
                format!("Session with ID '{}' not found.", req.id)
            }
            Err(e) => {
                eprintln!("Error getting session: {:?}", e);
                format!("Error getting session: {}", e)
            }
        }
    }

    #[tool(
        description = "Get the raw transcript with speaker attribution for a specific session. Returns the full conversation dialogue. Use the session ID from list_sessions."
    )]
    async fn get_transcript(&self, Parameters(req): Parameters<GetTranscriptRequest>) -> String {
        eprintln!("MCP call: get_transcript(id={})", req.id);

        match self
            .db
            .get_session(GetSessionFilter::Id(req.id.clone()))
            .await
        {
            Ok(Some(session)) => {
                eprintln!("Found transcript for: {}", session.title);
                formatters::transcript_to_markdown(session)
            }
            Ok(None) => {
                eprintln!("Session not found: {}", req.id);
                format!("Session with ID '{}' not found.", req.id)
            }
            Err(e) => {
                eprintln!("Error getting transcript: {:?}", e);
                format!("Error getting transcript: {}", e)
            }
        }
    }

    #[tool(
        description = "Search meeting notes by keyword, tag, or project. Query searches titles, summaries, note content, and participants. Tags and projects can be provided by name or ID, so users do not need to know internal IDs."
    )]
    async fn search_sessions(&self, Parameters(req): Parameters<SearchRequest>) -> String {
        eprintln!("MCP call: search_sessions({:?})", req);

        match crate::db::search_sessions(&self.db, req.into_filters()).await {
            Ok(sessions) => {
                eprintln!("Search found {} sessions", sessions.len());
                formatters::sessions_to_markdown(sessions)
            }
            Err(e) => {
                eprintln!("Error searching sessions: {:?}", e);
                format!("Error searching sessions: {}", e)
            }
        }
    }

    #[tool(
        description = "List all available tags that can be used to filter meeting notes. Use this when a user asks for notes by tag but the exact tag name is unclear."
    )]
    async fn list_tags(&self, Parameters(req): Parameters<ListMetadataRequest>) -> String {
        eprintln!("MCP call: list_tags(limit={})", req.limit);

        match self.db.list_all_tags().await {
            Ok(mut tags) => {
                tags.truncate(req.limit);
                formatters::tags_to_markdown(tags)
            }
            Err(e) => {
                eprintln!("Error listing tags: {:?}", e);
                format!("Error listing tags: {}", e)
            }
        }
    }

    #[tool(
        description = "List all projects. Projects are Typr spaces that group meeting notes. Use project names or IDs with search_sessions or list_sessions_by_project."
    )]
    async fn list_projects(&self, Parameters(req): Parameters<ListMetadataRequest>) -> String {
        eprintln!("MCP call: list_projects(limit={})", req.limit);

        match self.db.list_spaces().await {
            Ok(mut projects) => {
                projects.truncate(req.limit);
                formatters::projects_to_markdown(projects)
            }
            Err(e) => {
                eprintln!("Error listing projects: {:?}", e);
                format!("Error listing projects: {}", e)
            }
        }
    }

    #[tool(
        description = "List meeting notes that match one or more tags. Accepts tag names or tag IDs, with an optional keyword query and optional project filter."
    )]
    async fn list_sessions_by_tags(
        &self,
        Parameters(req): Parameters<ListSessionsByTagsRequest>,
    ) -> String {
        eprintln!("MCP call: list_sessions_by_tags({:?})", req);

        match crate::db::search_sessions(&self.db, req.into_filters()).await {
            Ok(sessions) => formatters::sessions_to_markdown(sessions),
            Err(e) => {
                eprintln!("Error listing sessions by tags: {:?}", e);
                format!("Error listing sessions by tags: {}", e)
            }
        }
    }

    #[tool(
        description = "List meeting notes in a project. Accepts project names or project IDs, with an optional keyword query and optional tag filter."
    )]
    async fn list_sessions_by_project(
        &self,
        Parameters(req): Parameters<ListSessionsByProjectRequest>,
    ) -> String {
        eprintln!("MCP call: list_sessions_by_project({:?})", req);

        match crate::db::search_sessions(&self.db, req.into_filters()).await {
            Ok(sessions) => formatters::sessions_to_markdown(sessions),
            Err(e) => {
                eprintln!("Error listing sessions by project: {:?}", e);
                format!("Error listing sessions by project: {}", e)
            }
        }
    }
}

#[tool_handler]
impl ServerHandler for TyprMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            ..Default::default()
        }
    }
}

// Request types with JSON schema for MCP (using schemars 1.0)
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListSessionsRequest {
    #[serde(default = "default_limit")]
    #[schemars(description = "Maximum number of sessions to return (default: 20)")]
    pub limit: usize,
}

fn default_limit() -> usize {
    20
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct GetSessionRequest {
    #[schemars(description = "The unique session ID")]
    pub id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct GetTranscriptRequest {
    #[schemars(description = "The unique session ID")]
    pub id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SearchRequest {
    #[schemars(
        description = "Optional keyword query. Searches note titles, summaries, note content, and participant names/emails."
    )]
    pub query: Option<String>,
    #[serde(default)]
    #[schemars(
        description = "Optional tag IDs to filter by. Matches notes with any provided tag ID."
    )]
    pub tag_ids: Vec<String>,
    #[serde(default)]
    #[schemars(
        description = "Optional tag names to filter by. Case-insensitive exact match. Matches notes with any provided tag name."
    )]
    pub tag_names: Vec<String>,
    #[serde(default, alias = "space_ids")]
    #[schemars(
        description = "Optional project IDs to filter by. Projects are stored as Typr spaces."
    )]
    pub project_ids: Vec<String>,
    #[serde(default, alias = "space_names")]
    #[schemars(
        description = "Optional project names to filter by. Case-insensitive partial match. Projects are stored as Typr spaces."
    )]
    pub project_names: Vec<String>,
    #[serde(default = "default_limit")]
    #[schemars(description = "Maximum number of sessions to return (default: 20, max: 250)")]
    pub limit: usize,
}

impl SearchRequest {
    fn into_filters(self) -> crate::db::SessionSearchFilters {
        crate::db::SessionSearchFilters {
            query: self.query,
            tag_ids: self.tag_ids,
            tag_names: self.tag_names,
            project_ids: self.project_ids,
            project_names: self.project_names,
            limit: self.limit,
        }
    }
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListMetadataRequest {
    #[serde(default = "default_metadata_limit")]
    #[schemars(description = "Maximum number of items to return (default: 100)")]
    pub limit: usize,
}

fn default_metadata_limit() -> usize {
    100
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListSessionsByTagsRequest {
    #[serde(default)]
    #[schemars(description = "Tag IDs to filter by. Matches notes with any provided tag ID.")]
    pub tag_ids: Vec<String>,
    #[serde(default)]
    #[schemars(
        description = "Tag names to filter by. Case-insensitive exact match. Matches notes with any provided tag name."
    )]
    pub tag_names: Vec<String>,
    #[schemars(description = "Optional keyword query within the tagged notes.")]
    pub query: Option<String>,
    #[serde(default, alias = "space_ids")]
    #[schemars(description = "Optional project IDs to further filter tagged notes.")]
    pub project_ids: Vec<String>,
    #[serde(default, alias = "space_names")]
    #[schemars(description = "Optional project names to further filter tagged notes.")]
    pub project_names: Vec<String>,
    #[serde(default = "default_limit")]
    #[schemars(description = "Maximum number of sessions to return (default: 20, max: 250)")]
    pub limit: usize,
}

impl ListSessionsByTagsRequest {
    fn into_filters(self) -> crate::db::SessionSearchFilters {
        crate::db::SessionSearchFilters {
            query: self.query,
            tag_ids: self.tag_ids,
            tag_names: self.tag_names,
            project_ids: self.project_ids,
            project_names: self.project_names,
            limit: self.limit,
        }
    }
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListSessionsByProjectRequest {
    #[serde(default, alias = "space_ids")]
    #[schemars(description = "Project IDs to filter by. Projects are stored as Typr spaces.")]
    pub project_ids: Vec<String>,
    #[serde(default, alias = "space_names")]
    #[schemars(
        description = "Project names to filter by. Case-insensitive partial match. Projects are stored as Typr spaces."
    )]
    pub project_names: Vec<String>,
    #[schemars(description = "Optional keyword query within the project notes.")]
    pub query: Option<String>,
    #[serde(default)]
    #[schemars(description = "Optional tag IDs to further filter project notes.")]
    pub tag_ids: Vec<String>,
    #[serde(default)]
    #[schemars(description = "Optional tag names to further filter project notes.")]
    pub tag_names: Vec<String>,
    #[serde(default = "default_limit")]
    #[schemars(description = "Maximum number of sessions to return (default: 20, max: 250)")]
    pub limit: usize,
}

impl ListSessionsByProjectRequest {
    fn into_filters(self) -> crate::db::SessionSearchFilters {
        crate::db::SessionSearchFilters {
            query: self.query,
            tag_ids: self.tag_ids,
            tag_names: self.tag_names,
            project_ids: self.project_ids,
            project_names: self.project_names,
            limit: self.limit,
        }
    }
}
