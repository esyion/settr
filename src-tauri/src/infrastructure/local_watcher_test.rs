use super::{event_affects_primary_document, is_atomic_temporary_name};
use std::path::PathBuf;

/// Verifies the primary file and atomic-write temporary file naming rules.
#[test]
fn recognizes_primary_document_and_atomic_temporary_names() {
    assert!(is_atomic_temporary_name(".AGENTS.md.tmp-123"));
    assert!(!is_atomic_temporary_name(".AGENTS.md.migrate-123"));
}

/// Verifies that only paths in the canonical document directory are accepted.
#[test]
fn filters_unrelated_and_nested_file_events() {
    let primary = PathBuf::from("C:/Users/test/AGENTS.md");
    assert!(event_affects_primary_document(
        &primary,
        &[PathBuf::from("C:/Users/test/AGENTS.md")]
    ));
    assert!(event_affects_primary_document(
        &primary,
        &[PathBuf::from("C:/Users/test/.AGENTS.md.tmp-123")]
    ));
    assert!(!event_affects_primary_document(
        &primary,
        &[PathBuf::from("C:/Users/test/project/AGENTS.md")]
    ));
    assert!(!event_affects_primary_document(
        &primary,
        &[PathBuf::from("C:/Users/test/README.md")]
    ));
}
