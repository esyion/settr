use super::sha256_hex;

/// Verifies that the shared hash helper emits the canonical API representation.
#[test]
fn uses_canonical_hash_without_algorithm_prefix() {
    assert_eq!(
        sha256_hex("content"),
        "ed7002b439e9ac845f22357d822bac1444730fbdb6016d3ec9432297b9ec9f73"
    );
}
