use agents_plus_lib::hash::sha256_hex;

#[test]
fn uses_canonical_hash_without_algorithm_prefix() {
    assert_eq!(
        sha256_hex("content"),
        "ed7002b439e9ac845f22357d822bac1444730fbdb6016d3ec9432297b9ec9f73"
    );
}
