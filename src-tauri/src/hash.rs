use sha2::{Digest, Sha256};

/// Computes the canonical lowercase SHA-256 hex representation.
pub fn sha256_hex(content: &str) -> String {
    let digest = Sha256::digest(content.as_bytes());
    format!("{digest:x}")
}
