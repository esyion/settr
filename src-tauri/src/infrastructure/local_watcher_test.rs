use super::{event_affects_documents, is_atomic_temporary_name};
use std::path::PathBuf;

/// Verifies atomic-write temporary file naming rules for supported formats.
#[test]
fn recognizes_atomic_temporary_names() {
    assert!(is_atomic_temporary_name(".AGENTS.md.tmp-123", "AGENTS.md"));
    assert!(is_atomic_temporary_name(".CLAUDE.md.tmp-123", "CLAUDE.md"));
    assert!(!is_atomic_temporary_name(
        ".AGENTS.md.migrate-123",
        "AGENTS.md"
    ));
}

/// Verifies that supported files and their temporary files are accepted.
#[test]
fn filters_unrelated_and_nested_file_events() {
    let documents = vec![
        PathBuf::from("C:/Users/test/AGENTS.md"),
        PathBuf::from("C:/Users/test/.claude/CLAUDE.md"),
    ];
    assert!(event_affects_documents(
        &documents,
        &[PathBuf::from("C:/Users/test/AGENTS.md")]
    ));
    assert!(event_affects_documents(
        &documents,
        &[PathBuf::from("C:/Users/test/.claude/CLAUDE.md")]
    ));
    assert!(event_affects_documents(
        &documents,
        &[PathBuf::from("C:/Users/test/.AGENTS.md.tmp-123")]
    ));
    assert!(event_affects_documents(
        &documents,
        &[PathBuf::from("C:/Users/test/.claude/.CLAUDE.md.tmp-123")]
    ));
    assert!(!event_affects_documents(
        &documents,
        &[PathBuf::from("C:/Users/test/project/AGENTS.md")]
    ));
    assert!(!event_affects_documents(
        &documents,
        &[PathBuf::from("C:/Users/test/README.md")]
    ));
}
