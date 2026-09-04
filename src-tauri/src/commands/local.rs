use crate::domain::document_format::DocumentFormat;
use crate::infrastructure::local_file;

/// Returns the stable desktop device identity.
#[tauri::command]
pub fn get_device_identity(app_version: String) -> Result<local_file::DeviceIdentity, String> {
    local_file::get_device_identity(&app_version)
}

/// Returns a local rule-document snapshot for the requested format.
#[tauri::command]
pub fn get_local_snapshot(format: DocumentFormat) -> Result<local_file::LocalFileSnapshot, String> {
    local_file::read_snapshot(format)
}

/// Saves the synchronization manifest for the requested format.
#[tauri::command]
pub fn save_local_manifest(
    request: local_file::SaveManifestRequest,
) -> Result<local_file::LocalManifest, String> {
    local_file::save_manifest(request.format, request.manifest)
}

/// Applies a remote document to the local file for the requested format.
#[tauri::command]
pub fn apply_remote_document(
    request: local_file::ApplyDocumentRequest,
) -> Result<local_file::LocalFileSnapshot, String> {
    local_file::apply_document(request)
}
