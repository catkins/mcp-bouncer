pub mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let settings_manager = settings::SettingsManager::new().expect("Failed to create settings manager");

    tauri::Builder::default()
        .manage(settings_manager)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::update_settings,
            settings::add_mcp_server,
            settings::remove_mcp_server,
            settings::update_mcp_server,
            settings::open_config_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
