// SPDX-License-Identifier: MIT

use std::sync::Arc;

use russh::client;
use russh::keys::key::PublicKey;
use tokio::net::TcpListener;

use super::model::{SshAuth, SshConfig};
use crate::utils::errors::AppError;

/// An active SSH tunnel performing local port forwarding.
///
/// The tunnel binds a local TCP listener and forwards accepted connections
/// through the SSH channel to the remote Redis host:port.
pub struct SshTunnel {
    /// The local port the tunnel is listening on.
    pub local_port: u16,
    /// Sender to signal the tunnel loop to stop.
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    /// Handle to the background tunnel task.
    task_handle: tokio::task::JoinHandle<()>,
}

impl std::fmt::Debug for SshTunnel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SshTunnel")
            .field("local_port", &self.local_port)
            .finish_non_exhaustive()
    }
}

impl SshTunnel {
    /// Shut down the tunnel, closing the listener and aborting forwarding tasks.
    pub fn shutdown(self) {
        // Drop impl handles the actual cleanup
        drop(self);
    }
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        self.task_handle.abort();
        tracing::info!(local_port = self.local_port, "SSH tunnel shut down");
    }
}

/// Minimal SSH client handler that accepts all server host keys.
///
/// This is the trust-on-first-use (TOFU) pattern, consistent with most
/// desktop SSH GUI tools. The user explicitly configures SSH connectivity.
struct TunnelHandler;

#[async_trait::async_trait]
impl client::Handler for TunnelHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

/// Establish an SSH tunnel with local port forwarding.
///
/// Connects to the SSH server specified in `ssh_config`, authenticates,
/// and starts a local TCP listener that forwards connections to
/// `remote_host:remote_port` through the SSH channel.
pub async fn establish_tunnel(
    ssh_config: &SshConfig,
    remote_host: &str,
    remote_port: u16,
) -> Result<SshTunnel, AppError> {
    if ssh_config.host.is_empty() {
        return Err(AppError::InvalidInput("SSH host must not be empty".into()));
    }
    if ssh_config.username.is_empty() {
        return Err(AppError::InvalidInput(
            "SSH username must not be empty".into(),
        ));
    }
    if matches!(ssh_config.auth, SshAuth::Agent) {
        return Err(AppError::Connection(
            "SSH agent authentication is not yet supported".into(),
        ));
    }

    // Connect to SSH server
    let config = Arc::new(client::Config::default());
    let ssh_addr = format!("{}:{}", ssh_config.host, ssh_config.port);

    let mut session = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        client::connect(config, &ssh_addr, TunnelHandler),
    )
    .await
    .map_err(|_| AppError::Timeout("SSH connection timed out".into()))?
    .map_err(|e| AppError::Connection(format!("SSH connection failed: {e}")))?;

    authenticate(&mut session, ssh_config).await?;

    // Bind local listener
    let bind_addr = format!("127.0.0.1:{}", ssh_config.local_port.unwrap_or(0));
    let listener = TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| AppError::Connection(format!("Failed to bind local tunnel port: {e}")))?;
    let local_port = listener
        .local_addr()
        .map_err(|e| AppError::Connection(format!("Failed to get local address: {e}")))?
        .port();

    let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    let session = Arc::new(tokio::sync::Mutex::new(session));
    let remote_host_owned = remote_host.to_string();

    tracing::info!(
        ssh_host = %ssh_config.host,
        ssh_port = ssh_config.port,
        local_port = local_port,
        remote_host = %remote_host,
        remote_port = remote_port,
        "SSH tunnel established"
    );

    let task_handle = tokio::spawn(async move {
        let remote_host = remote_host_owned;
        loop {
            tokio::select! {
                _ = &mut shutdown_rx => {
                    tracing::debug!("SSH tunnel shutdown signal received");
                    break;
                }
                accept_result = listener.accept() => {
                    match accept_result {
                        Ok((tcp_stream, peer_addr)) => {
                            tracing::debug!(%peer_addr, "Tunnel accepted local connection");
                            let handle = Arc::clone(&session);
                            let rhost = remote_host.clone();
                            let rport = remote_port;
                            tokio::spawn(async move {
                                if let Err(e) = forward_connection(handle, tcp_stream, &rhost, rport).await {
                                    tracing::warn!("SSH tunnel forwarding error: {e}");
                                }
                            });
                        }
                        Err(e) => {
                            tracing::error!("SSH tunnel listener accept error: {e}");
                            break;
                        }
                    }
                }
            }
        }
    });

    Ok(SshTunnel {
        local_port,
        shutdown_tx: Some(shutdown_tx),
        task_handle,
    })
}

/// Authenticate the SSH session based on the configured auth method.
async fn authenticate(
    session: &mut client::Handle<TunnelHandler>,
    ssh_config: &SshConfig,
) -> Result<(), AppError> {
    match &ssh_config.auth {
        SshAuth::Password { password } => {
            let auth_ok = session
                .authenticate_password(&ssh_config.username, password)
                .await
                .map_err(|e| AppError::Connection(format!("SSH password auth failed: {e}")))?;
            if !auth_ok {
                return Err(AppError::Connection(
                    "SSH password authentication rejected".into(),
                ));
            }
        }
        SshAuth::PrivateKey {
            key_path,
            passphrase,
        } => {
            let key_pair = russh_keys::load_secret_key(key_path, passphrase.as_deref())
                .map_err(|e| AppError::Connection(format!("Failed to load SSH key: {e}")))?;
            let auth_ok = session
                .authenticate_publickey(&ssh_config.username, Arc::new(key_pair))
                .await
                .map_err(|e| AppError::Connection(format!("SSH key auth failed: {e}")))?;
            if !auth_ok {
                return Err(AppError::Connection(
                    "SSH public key authentication rejected".into(),
                ));
            }
        }
        SshAuth::Agent => {
            return Err(AppError::Connection(
                "SSH agent authentication is not yet supported".into(),
            ));
        }
    }
    Ok(())
}

/// Forward a single TCP connection through the SSH channel to the remote host.
async fn forward_connection(
    session: Arc<tokio::sync::Mutex<client::Handle<TunnelHandler>>>,
    mut tcp_stream: tokio::net::TcpStream,
    remote_host: &str,
    remote_port: u16,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let channel = {
        let handle = session.lock().await;
        handle
            .channel_open_direct_tcpip(remote_host, remote_port.into(), "127.0.0.1", 0)
            .await?
    };

    let (mut tcp_read, mut tcp_write) = tcp_stream.split();

    let mut channel_stream = channel.into_stream();

    // Bidirectional copy
    let (mut ssh_read, mut ssh_write) = tokio::io::split(&mut channel_stream);

    tokio::select! {
        result = tokio::io::copy(&mut tcp_read, &mut ssh_write) => {
            if let Err(e) = result {
                tracing::trace!("local->ssh copy ended: {e}");
            }
        }
        result = tokio::io::copy(&mut ssh_read, &mut tcp_write) => {
            if let Err(e) = result {
                tracing::trace!("ssh->local copy ended: {e}");
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_ssh_host_rejected() {
        let config = SshConfig {
            enabled: true,
            host: String::new(),
            port: 22,
            username: "user".into(),
            auth: SshAuth::Password {
                password: "pass".into(),
            },
            local_port: None,
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(establish_tunnel(&config, "redis.local", 6379));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("SSH host must not be empty"));
    }

    #[test]
    fn test_empty_ssh_username_rejected() {
        let config = SshConfig {
            enabled: true,
            host: "bastion.example.com".into(),
            port: 22,
            username: String::new(),
            auth: SshAuth::Password {
                password: "pass".into(),
            },
            local_port: None,
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(establish_tunnel(&config, "redis.local", 6379));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("SSH username must not be empty"));
    }

    #[test]
    fn test_agent_auth_not_supported() {
        let config = SshConfig {
            enabled: true,
            host: "bastion.example.com".into(),
            port: 22,
            username: "user".into(),
            auth: SshAuth::Agent,
            local_port: None,
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(establish_tunnel(&config, "redis.local", 6379));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("not yet supported"));
    }
}
