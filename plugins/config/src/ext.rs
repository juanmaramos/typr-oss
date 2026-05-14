use tauri::Manager;
use tauri_plugin_store2::{ScopedStore, StorePluginExt};

use crate::StoreKey;

pub trait ConfigPluginExt<R: tauri::Runtime> {
    fn config_store(&self) -> ScopedStore<R, StoreKey>;
}

impl<R: tauri::Runtime, T: Manager<R>> ConfigPluginExt<R> for T {
    fn config_store(&self) -> ScopedStore<R, StoreKey> {
        self.scoped_store(crate::PLUGIN_NAME).unwrap()
    }
}
