use crate::infrastructure::local_file;

#[tauri::command]
pub fn get_device_identity(app_version: String) -> Result<local_file::DeviceIdentity, String> {
    local_file::get_device_identity(&app_version)
}

#[tauri::command]
pub fn get_local_snapshot() -> Result<local_file::LocalFileSnapshot, String> {
    local_file::read_snapshot()
}

#[tauri::command]
pub fn save_local_manifest(
    request: local_file::SaveManifestRequest,
) -> Result<local_file::LocalManifest, String> {
    local_file::save_manifest(request.manifest)
}

#[tauri::command]
pub fn apply_remote_document(
    request: local_file::ApplyDocumentRequest,
) -> Result<local_file::LocalFileSnapshot, String> {
    local_file::apply_document(request)
}
