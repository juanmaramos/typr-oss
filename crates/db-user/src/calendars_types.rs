use crate::user_common_derives;

user_common_derives! {
    pub struct Calendar {
        pub id: String,
        pub tracking_id: String,
        pub user_id: String,
        pub platform: Platform,
        pub name: String,
        pub selected: bool,
        pub source: Option<String>,
    }
}

user_common_derives! {
    #[derive(strum::Display)]
    pub enum Platform {
        #[strum(serialize = "Apple")]
        Apple,
        #[strum(serialize = "Google")]
        Google,
        #[strum(serialize = "Outlook")]
        Outlook,
    }
}

impl From<typr_calendar_interface::Platform> for Platform {
    fn from(platform: typr_calendar_interface::Platform) -> Self {
        match platform {
            typr_calendar_interface::Platform::Apple => Platform::Apple,
            typr_calendar_interface::Platform::Google => Platform::Google,
            typr_calendar_interface::Platform::Outlook => Platform::Outlook,
        }
    }
}

impl From<Platform> for typr_calendar_interface::Platform {
    fn from(platform: Platform) -> Self {
        match platform {
            Platform::Apple => typr_calendar_interface::Platform::Apple,
            Platform::Google => typr_calendar_interface::Platform::Google,
            Platform::Outlook => typr_calendar_interface::Platform::Outlook,
        }
    }
}
