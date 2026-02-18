// SPDX-License-Identifier: MIT

use super::model::{DangerLevel, DangerousWarning};

/// Parse a raw command string into argument tokens.
///
/// Handles double-quoted strings (preserving spaces inside quotes)
/// and basic escape sequences (\", \\).
///
/// # Examples
/// ```
/// use redis_lens_lib::redis::cli::parser::parse_command;
/// let args = parse_command("SET key \"hello world\"");
/// assert_eq!(args, vec!["SET", "key", "hello world"]);
/// ```
pub fn parse_command(input: &str) -> Vec<String> {
    let input = input.trim();
    if input.is_empty() {
        return Vec::new();
    }

    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote_char: Option<char> = None;
    let mut escape_next = false;
    let chars: Vec<char> = input.chars().collect();

    for &ch in &chars {
        if escape_next {
            current.push(ch);
            escape_next = false;
            continue;
        }

        match ch {
            '\\' if quote_char == Some('"') => {
                escape_next = true;
            }
            '"' if quote_char == Some('"') => {
                // Close double quote
                quote_char = None;
            }
            '"' if quote_char.is_none() => {
                // Open double quote
                quote_char = Some('"');
            }
            '\'' if quote_char == Some('\'') => {
                // Close single quote
                quote_char = None;
            }
            '\'' if quote_char.is_none() => {
                // Open single quote
                quote_char = Some('\'');
            }
            ' ' | '\t' if quote_char.is_none() => {
                if !current.is_empty() {
                    args.push(current.clone());
                    current.clear();
                }
            }
            _ => {
                current.push(ch);
            }
        }
    }

    if !current.is_empty() {
        args.push(current);
    }

    args
}

/// Dangerous commands and their warning levels/messages.
static DANGEROUS_COMMANDS: &[(&str, DangerLevel, &str)] = &[
    ("FLUSHALL", DangerLevel::Critical, "This will delete ALL keys in ALL databases. This cannot be undone."),
    ("FLUSHDB", DangerLevel::Critical, "This will delete ALL keys in the current database. This cannot be undone."),
    ("SHUTDOWN", DangerLevel::Critical, "This will shut down the Redis server."),
    ("DEBUG", DangerLevel::Warning, "DEBUG commands can cause server instability."),
    ("SWAPDB", DangerLevel::Warning, "This will swap two databases atomically."),
    ("REPLICAOF", DangerLevel::Warning, "This will change the replication topology."),
    ("SLAVEOF", DangerLevel::Warning, "This will change the replication topology."),
    ("FAILOVER", DangerLevel::Warning, "This will trigger a replica failover."),
];

/// Check if a command is dangerous. Returns a warning if so.
pub fn check_dangerous(args: &[String]) -> Option<DangerousWarning> {
    if args.is_empty() {
        return None;
    }

    let cmd = args[0].to_uppercase();

    // Check CONFIG SET specifically
    if cmd == "CONFIG" && args.len() > 1 && args[1].eq_ignore_ascii_case("SET") {
        return Some(DangerousWarning {
            command: args.join(" "),
            level: DangerLevel::Warning,
            message: "This will modify server configuration.".into(),
        });
    }

    // Check SCRIPT FLUSH
    if cmd == "SCRIPT" && args.len() > 1 && args[1].eq_ignore_ascii_case("FLUSH") {
        return Some(DangerousWarning {
            command: args.join(" "),
            level: DangerLevel::Warning,
            message: "This will remove all cached Lua scripts.".into(),
        });
    }

    // Check CLUSTER write operations
    if cmd == "CLUSTER" && args.len() > 1 {
        let sub = args[1].to_uppercase();
        let write_ops = ["ADDSLOTS", "DELSLOTS", "FAILOVER", "FORGET",
                         "MEET", "REPLICATE", "RESET", "SAVECONFIG",
                         "SET-CONFIG-EPOCH", "SETSLOT", "FLUSHSLOTS"];
        if write_ops.contains(&sub.as_str()) {
            return Some(DangerousWarning {
                command: args.join(" "),
                level: DangerLevel::Warning,
                message: "This will modify the cluster configuration.".into(),
            });
        }
    }

    for &(name, ref level, msg) in DANGEROUS_COMMANDS {
        if cmd == name {
            return Some(DangerousWarning {
                command: args.join(" "),
                level: level.clone(),
                message: msg.into(),
            });
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_command() {
        let args = parse_command("GET mykey");
        assert_eq!(args, vec!["GET", "mykey"]);
    }

    #[test]
    fn test_parse_quoted_string() {
        let args = parse_command("SET key \"hello world\"");
        assert_eq!(args, vec!["SET", "key", "hello world"]);
    }

    #[test]
    fn test_parse_single_quoted() {
        let args = parse_command("SET key 'hello world'");
        assert_eq!(args, vec!["SET", "key", "hello world"]);
    }

    #[test]
    fn test_parse_empty_input() {
        let args = parse_command("");
        assert!(args.is_empty());
    }

    #[test]
    fn test_parse_whitespace_only() {
        let args = parse_command("   ");
        assert!(args.is_empty());
    }

    #[test]
    fn test_parse_multiple_spaces() {
        let args = parse_command("SET   key   value");
        assert_eq!(args, vec!["SET", "key", "value"]);
    }

    #[test]
    fn test_parse_escaped_quote() {
        let args = parse_command(r#"SET key "hello \"world\"""#);
        assert_eq!(args, vec!["SET", "key", "hello \"world\""]);
    }

    #[test]
    fn test_dangerous_flushall() {
        let args = vec!["FLUSHALL".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_some());
        assert!(matches!(warning.unwrap().level, DangerLevel::Critical));
    }

    #[test]
    fn test_dangerous_flushall_case_insensitive() {
        let args = vec!["flushall".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_some());
    }

    #[test]
    fn test_dangerous_config_set() {
        let args = vec!["CONFIG".into(), "SET".into(), "maxmemory".into(), "100mb".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_some());
        assert!(matches!(warning.unwrap().level, DangerLevel::Warning));
    }

    #[test]
    fn test_dangerous_config_get_is_safe() {
        let args = vec!["CONFIG".into(), "GET".into(), "maxmemory".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_none());
    }

    #[test]
    fn test_safe_command() {
        let args = vec!["GET".into(), "mykey".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_none());
    }

    #[test]
    fn test_dangerous_cluster_write() {
        let args = vec!["CLUSTER".into(), "FAILOVER".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_some());
    }

    #[test]
    fn test_safe_cluster_read() {
        let args = vec!["CLUSTER".into(), "INFO".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_none());
    }

    #[test]
    fn test_empty_args_safe() {
        let args: Vec<String> = vec![];
        let warning = check_dangerous(&args);
        assert!(warning.is_none());
    }
}
