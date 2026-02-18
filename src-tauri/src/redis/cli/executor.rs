// SPDX-License-Identifier: MIT

use std::time::Instant;

use deadpool_redis::Pool;

use super::model::{CommandResult, DangerousWarning, ExecuteResponse};
use super::parser;
use crate::utils::errors::AppError;

/// Execute a raw Redis command string.
///
/// Parses the input into arguments, checks for dangerous commands (unless
/// `force` is true), then executes via `redis::cmd()` and converts the
/// response to a `CommandResult`.
pub async fn execute(pool: &Pool, input: &str, force: bool) -> Result<ExecuteResponse, AppError> {
    let args = parser::parse_command(input);

    if args.is_empty() {
        return Err(AppError::InvalidInput("Empty command".into()));
    }

    // Check for dangerous commands unless force is set
    if !force {
        if let Some(warning) = parser::check_dangerous(&args) {
            return Ok(ExecuteResponse {
                result: CommandResult::Error(format!(
                    "DANGEROUS: {} — Re-send with force=true to confirm.",
                    warning.message
                )),
                duration_ms: 0.0,
                command: input.to_string(),
            });
        }
    }

    let mut conn = pool.get().await?;

    // Build the redis command
    let mut cmd = redis::cmd(&args[0].to_uppercase());
    for arg in &args[1..] {
        cmd.arg(arg.as_str());
    }

    let start = Instant::now();
    let value: redis::Value = cmd.query_async(&mut conn).await?;
    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;

    let result = value_to_result(value);

    Ok(ExecuteResponse {
        result,
        duration_ms,
        command: input.to_string(),
    })
}

/// Convert a `redis::Value` into our serializable `CommandResult`.
fn value_to_result(value: redis::Value) -> CommandResult {
    match value {
        redis::Value::Nil => CommandResult::Nil,
        redis::Value::Int(i) => CommandResult::Integer(i),
        redis::Value::BulkString(bytes) => {
            CommandResult::BulkString(String::from_utf8_lossy(&bytes).into_owned())
        }
        redis::Value::Array(arr) => {
            CommandResult::Array(arr.into_iter().map(value_to_result).collect())
        }
        redis::Value::SimpleString(s) => CommandResult::Ok(s),
        redis::Value::Okay => CommandResult::Ok("OK".into()),
        redis::Value::ServerError(e) => {
            let msg = match e.details() {
                Some(details) => format!("{}: {details}", e.code()),
                None => e.code().to_string(),
            };
            CommandResult::Error(msg)
        }
        redis::Value::Double(f) => CommandResult::BulkString(f.to_string()),
        redis::Value::Boolean(b) => CommandResult::Integer(i64::from(b)),
        redis::Value::Map(pairs) => {
            let items: Vec<CommandResult> = pairs
                .into_iter()
                .flat_map(|(k, v)| vec![value_to_result(k), value_to_result(v)])
                .collect();
            CommandResult::Array(items)
        }
        redis::Value::Set(items) => {
            CommandResult::Array(items.into_iter().map(value_to_result).collect())
        }
        redis::Value::VerbatimString { text, .. } => CommandResult::BulkString(text),
        redis::Value::BigNumber(n) => CommandResult::BulkString(n.to_string()),
        redis::Value::Push { data, .. } => {
            CommandResult::Array(data.into_iter().map(value_to_result).collect())
        }
        redis::Value::Attribute { data, .. } => value_to_result(*data),
    }
}

/// Check if a command is dangerous (for frontend pre-check).
pub fn check_dangerous_command(input: &str) -> Option<DangerousWarning> {
    let args = parser::parse_command(input);
    parser::check_dangerous(&args)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_value_to_result_nil() {
        let result = value_to_result(redis::Value::Nil);
        assert!(matches!(result, CommandResult::Nil));
    }

    #[test]
    fn test_value_to_result_int() {
        let result = value_to_result(redis::Value::Int(42));
        assert!(matches!(result, CommandResult::Integer(42)));
    }

    #[test]
    fn test_value_to_result_ok() {
        let result = value_to_result(redis::Value::Okay);
        if let CommandResult::Ok(s) = result {
            assert_eq!(s, "OK");
        } else {
            panic!("Expected Ok");
        }
    }

    #[test]
    fn test_value_to_result_bulk_string() {
        let result = value_to_result(redis::Value::BulkString(b"hello".to_vec()));
        if let CommandResult::BulkString(s) = result {
            assert_eq!(s, "hello");
        } else {
            panic!("Expected BulkString");
        }
    }

    #[test]
    fn test_value_to_result_array() {
        let arr = redis::Value::Array(vec![
            redis::Value::Int(1),
            redis::Value::BulkString(b"two".to_vec()),
            redis::Value::Nil,
        ]);
        let result = value_to_result(arr);
        if let CommandResult::Array(items) = result {
            assert_eq!(items.len(), 3);
            assert!(matches!(items[0], CommandResult::Integer(1)));
            assert!(matches!(items[2], CommandResult::Nil));
        } else {
            panic!("Expected Array");
        }
    }

    #[test]
    fn test_value_to_result_simple_string() {
        let result = value_to_result(redis::Value::SimpleString("PONG".into()));
        if let CommandResult::Ok(s) = result {
            assert_eq!(s, "PONG");
        } else {
            panic!("Expected Ok");
        }
    }

    #[test]
    fn test_check_dangerous_command_flushall() {
        let warning = check_dangerous_command("FLUSHALL");
        assert!(warning.is_some());
    }

    #[test]
    fn test_check_dangerous_command_safe() {
        let warning = check_dangerous_command("GET mykey");
        assert!(warning.is_none());
    }
}
