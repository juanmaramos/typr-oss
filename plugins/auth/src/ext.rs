use crate::store::{self, StoreKey};

pub trait AuthPluginExt<R: tauri::Runtime> {
    fn get_from_store(&self, key: StoreKey) -> Result<Option<String>, crate::Error>;
    fn set_in_store(&self, key: StoreKey, value: impl Into<String>) -> Result<(), crate::Error>;
}

impl<R: tauri::Runtime, T: tauri::Manager<R>> AuthPluginExt<R> for T {
    fn get_from_store(&self, key: StoreKey) -> Result<Option<String>, crate::Error> {
        let store = store::get_store(self);

        Ok(store
            .get(key.as_ref())
            .and_then(|v| v.as_str().map(|s| s.to_string())))
    }

    fn set_in_store(&self, key: StoreKey, value: impl Into<String>) -> Result<(), crate::Error> {
        let store = store::get_store(self);
        store.set(key.as_ref(), serde_json::Value::String(value.into()));
        store.save()?;

        Ok(())
    }
}
