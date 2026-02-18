// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;

use super::model::ClientInfo;
use crate::utils::errors::AppError;

/// Fetch and parse CLIENT LIST output.
pub async fn get_client_list(pool: &Pool) -> Result<Vec<ClientInfo>, AppError> {
    let mut conn = pool.get().await?;
    let raw: String = redis::cmd("CLIENT")
        .arg("LIST")
        .query_async(&mut conn)
        .await?;

    Ok(parse_client_list(&raw))
}

/// Kill a client by ID.
pub async fn kill_client(pool: &Pool, client_id: u64) -> Result<(), AppError> {
    let mut conn = pool.get().await?;
    redis::cmd("CLIENT")
        .arg("KILL")
        .arg("ID")
        .arg(client_id)
        .query_async::<()>(&mut conn)
        .await?;
    Ok(())
}

/// Parse CLIENT LIST output into structured entries.
///
/// CLIENT LIST returns one line per client with space-separated key=value pairs:
/// `id=1 addr=127.0.0.1:6379 fd=5 name= age=100 idle=10 flags=N db=0 ...`
pub fn parse_client_list(raw: &str) -> Vec<ClientInfo> {
    raw.lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(parse_client_line)
        .collect()
}

/// Parse a single CLIENT LIST line.
fn parse_client_line(line: &str) -> Option<ClientInfo> {
    let mut id = 0u64;
    let mut addr = String::new();
    let mut age = 0u64;
    let mut idle = 0u64;
    let mut flags = String::new();
    let mut db = 0i64;
    let mut cmd = String::new();
    let mut name = String::new();

    for part in line.split_whitespace() {
        if let Some((key, value)) = part.split_once('=') {
            match key {
                "id" => id = value.parse().unwrap_or(0),
                "addr" => addr = value.to_string(),
                "age" => age = value.parse().unwrap_or(0),
                "idle" => idle = value.parse().unwrap_or(0),
                "flags" => flags = value.to_string(),
                "db" => db = value.parse().unwrap_or(0),
                "cmd" => cmd = value.to_string(),
                "name" => name = value.to_string(),
                _ => {}
            }
        }
    }

    // Skip entries with no ID (shouldn't happen, but be defensive)
    if id == 0 && addr.is_empty() {
        return None;
    }

    Some(ClientInfo {
        id,
        addr,
        age,
        idle,
        flags,
        db,
        cmd,
        name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_client_list_single() {
        let raw = "id=5 addr=127.0.0.1:52340 fd=8 name=myapp age=100 idle=10 flags=N db=0 sub=0 psub=0 multi=-1 qbuf=0 qbuf-free=32768 obl=0 oll=0 omem=0 events=r cmd=get\n";
        let clients = parse_client_list(raw);
        assert_eq!(clients.len(), 1);
        assert_eq!(clients[0].id, 5);
        assert_eq!(clients[0].addr, "127.0.0.1:52340");
        assert_eq!(clients[0].name, "myapp");
        assert_eq!(clients[0].age, 100);
        assert_eq!(clients[0].idle, 10);
        assert_eq!(clients[0].flags, "N");
        assert_eq!(clients[0].db, 0);
        assert_eq!(clients[0].cmd, "get");
    }

    #[test]
    fn test_parse_client_list_multiple() {
        let raw = "id=1 addr=10.0.0.1:1234 fd=5 name= age=50 idle=5 flags=N db=0 cmd=set\nid=2 addr=10.0.0.2:5678 fd=6 name=worker age=200 idle=0 flags=S db=1 cmd=subscribe\n";
        let clients = parse_client_list(raw);
        assert_eq!(clients.len(), 2);
        assert_eq!(clients[0].id, 1);
        assert_eq!(clients[0].name, "");
        assert_eq!(clients[1].id, 2);
        assert_eq!(clients[1].name, "worker");
        assert_eq!(clients[1].db, 1);
    }

    #[test]
    fn test_parse_client_list_empty() {
        let clients = parse_client_list("");
        assert!(clients.is_empty());
    }

    #[test]
    fn test_parse_client_list_with_blank_lines() {
        let raw = "id=1 addr=127.0.0.1:1234 fd=5 name= age=10 idle=0 flags=N db=0 cmd=ping\n\n";
        let clients = parse_client_list(raw);
        assert_eq!(clients.len(), 1);
    }
}
