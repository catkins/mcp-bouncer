use std::fmt;

#[cfg(test)]
use std::collections::HashMap;
#[cfg(test)]
use std::sync::Mutex;

use keyring::{Entry, Error as KeyringError};

/// Logical grouping for secrets stored by the application. More namespaces can be
/// added as we start persisting additional material (e.g. named secrets for
/// headers or CLI arguments).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SecretNamespace {
    OAuthToken,
    NamedSecret,
}

impl SecretNamespace {
    fn prefix(self) -> &'static str {
        match self {
            SecretNamespace::OAuthToken => "oauth",
            SecretNamespace::NamedSecret => "named",
        }
    }
}

/// Fully qualified key for a stored secret.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SecretKey<'a> {
    pub namespace: SecretNamespace,
    pub identifier: &'a str,
}

impl SecretKey<'_> {
    fn username(&self) -> String {
        format!("{}::{}", self.namespace.prefix(), self.identifier)
    }
}

#[derive(Debug)]
pub enum SecretStoreError {
    Backend(String),
}

impl fmt::Display for SecretStoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SecretStoreError::Backend(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for SecretStoreError {}

pub trait SecretStore: Send + Sync {
    fn set(&self, key: &SecretKey<'_>, value: &str) -> Result<(), SecretStoreError>;
    fn get(&self, key: &SecretKey<'_>) -> Result<Option<String>, SecretStoreError>;
    fn delete(&self, key: &SecretKey<'_>) -> Result<(), SecretStoreError>;
}

/// Production secret store backed by the operating system keyring.
#[derive(Clone)]
pub struct KeyringSecretStore {
    service: String,
}

impl KeyringSecretStore {
    const DEFAULT_SERVICE: &'static str = "app.mcp.bouncer";

    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    fn entry(&self, username: &str) -> Result<Entry, SecretStoreError> {
        Entry::new(&self.service, username).map_err(|err| {
            SecretStoreError::Backend(format!(
                "keyring entry for service `{}` and user `{}`: {err}",
                self.service, username
            ))
        })
    }
}

impl Default for KeyringSecretStore {
    fn default() -> Self {
        Self::new(Self::DEFAULT_SERVICE)
    }
}

impl SecretStore for KeyringSecretStore {
    fn set(&self, key: &SecretKey<'_>, value: &str) -> Result<(), SecretStoreError> {
        let entry = self.entry(&key.username())?;
        entry
            .set_password(value)
            .map_err(|err| SecretStoreError::Backend(err.to_string()))
    }

    fn get(&self, key: &SecretKey<'_>) -> Result<Option<String>, SecretStoreError> {
        let entry = self.entry(&key.username())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(err) => Err(SecretStoreError::Backend(err.to_string())),
        }
    }

    fn delete(&self, key: &SecretKey<'_>) -> Result<(), SecretStoreError> {
        let entry = self.entry(&key.username())?;
        match entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(err) => Err(SecretStoreError::Backend(err.to_string())),
        }
    }
}

/// Simple in-memory store for tests so we do not touch the real OS keychain.
#[cfg(test)]
#[derive(Default)]
pub struct MemorySecretStore {
    secrets: Mutex<HashMap<String, String>>,
}

#[cfg(test)]
impl MemorySecretStore {
    pub fn new() -> Self {
        Self::default()
    }
}

#[cfg(test)]
impl SecretStore for MemorySecretStore {
    fn set(&self, key: &SecretKey<'_>, value: &str) -> Result<(), SecretStoreError> {
        let mut guard = self.secrets.lock().unwrap();
        guard.insert(key.username(), value.to_string());
        Ok(())
    }

    fn get(&self, key: &SecretKey<'_>) -> Result<Option<String>, SecretStoreError> {
        let guard = self.secrets.lock().unwrap();
        Ok(guard.get(&key.username()).cloned())
    }

    fn delete(&self, key: &SecretKey<'_>) -> Result<(), SecretStoreError> {
        let mut guard = self.secrets.lock().unwrap();
        guard.remove(&key.username());
        Ok(())
    }
}
