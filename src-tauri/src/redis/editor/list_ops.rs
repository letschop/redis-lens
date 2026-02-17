// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;

use super::model::ListElement;
use crate::utils::errors::AppError;

/// Get a range of list elements.
pub async fn get_list_range(
    pool: &Pool,
    key: &str,
    start: i64,
    stop: i64,
) -> Result<Vec<ListElement>, AppError> {
    let mut conn = pool.get().await?;

    let values: Vec<String> = redis::cmd("LRANGE")
        .arg(key)
        .arg(start)
        .arg(stop)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("LRANGE failed: {e}")))?;

    Ok(values
        .into_iter()
        .enumerate()
        .map(|(i, value)| ListElement {
            #[allow(clippy::cast_possible_wrap)]
            index: start + i as i64,
            value,
        })
        .collect())
}

/// Push an element to the head or tail of a list.
pub async fn push_list_element(
    pool: &Pool,
    key: &str,
    value: &str,
    head: bool,
) -> Result<u64, AppError> {
    let mut conn = pool.get().await?;

    let cmd_name = if head { "LPUSH" } else { "RPUSH" };

    let new_length: u64 = redis::cmd(cmd_name)
        .arg(key)
        .arg(value)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("{cmd_name} failed: {e}")))?;

    Ok(new_length)
}

/// Set the value of an element at a specific index.
pub async fn set_list_element(
    pool: &Pool,
    key: &str,
    index: i64,
    value: &str,
) -> Result<(), AppError> {
    let mut conn = pool.get().await?;

    redis::cmd("LSET")
        .arg(key)
        .arg(index)
        .arg(value)
        .query_async::<String>(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("LSET failed: {e}")))?;

    Ok(())
}

/// Remove elements from a list by value.
///
/// `count > 0`: remove first `count` occurrences from head.
/// `count < 0`: remove first `|count|` occurrences from tail.
/// `count == 0`: remove all occurrences.
pub async fn remove_list_element(
    pool: &Pool,
    key: &str,
    count: i64,
    value: &str,
) -> Result<u64, AppError> {
    let mut conn = pool.get().await?;

    let removed: u64 = redis::cmd("LREM")
        .arg(key)
        .arg(count)
        .arg(value)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("LREM failed: {e}")))?;

    Ok(removed)
}
