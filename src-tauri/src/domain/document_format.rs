use serde::{Deserialize, Serialize};

/// Supported local rule-document formats.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DocumentFormat {
    /// The classic `~/AGENTS.md` rule document.
    AgentsMd,
    /// The Claude rule document stored at `~/.claude/CLAUDE.md`.
    ClaudeMd,
}

/// All rule formats recognized by the current local-file implementation.
pub const SUPPORTED_FORMATS: [DocumentFormat; 2] =
    [DocumentFormat::AgentsMd, DocumentFormat::ClaudeMd];

impl DocumentFormat {
    /// Returns the rule-document file name.
    pub fn file_name(self) -> &'static str {
        match self {
            Self::AgentsMd => "AGENTS.md",
            Self::ClaudeMd => "CLAUDE.md",
        }
    }

    /// Returns the directory name below the user home, if one is required.
    pub fn directory_name(self) -> Option<&'static str> {
        match self {
            Self::AgentsMd => None,
            Self::ClaudeMd => Some(".claude"),
        }
    }

    /// Returns the user-facing home-relative path.
    pub fn display_path(self) -> String {
        match self.directory_name() {
            Some(directory) => format!("~/{directory}/{}", self.file_name()),
            None => format!("~/{}", self.file_name()),
        }
    }

    /// Returns the format-specific manifest file name.
    pub fn manifest_file_name(self) -> &'static str {
        match self {
            Self::AgentsMd => "manifest.json",
            Self::ClaudeMd => "claude-md-manifest.json",
        }
    }

    /// Returns the prefix used by format-specific backups and temporary files.
    pub fn file_stem(self) -> &'static str {
        match self {
            Self::AgentsMd => "AGENTS",
            Self::ClaudeMd => "CLAUDE",
        }
    }
}
