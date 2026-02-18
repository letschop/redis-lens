// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;

use super::model::{BitmapInfo, GeoMember, HllInfo, JsonValue};
use crate::utils::errors::AppError;

// ─── JSON Operations ────────────────────────────────────────────

/// Get a JSON value. Tries JSON.GET first, falls back to GET for plain strings.
pub async fn get_json_value(pool: &Pool, key: &str, path: &str) -> Result<JsonValue, AppError> {
    let mut conn = pool.get().await?;

    // Try JSON.GET first (RedisJSON module)
    let result: Result<String, _> = redis::cmd("JSON.GET")
        .arg(key)
        .arg(path)
        .query_async(&mut conn)
        .await;

    if let Ok(json) = result {
        Ok(JsonValue {
            json,
            is_module: true,
        })
    } else {
        // Fallback: try plain GET (value might be a JSON string stored as a regular string)
        let plain: String = redis::cmd("GET")
            .arg(key)
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Redis(format!("GET failed: {e}")))?;
        Ok(JsonValue {
            json: plain,
            is_module: false,
        })
    }
}

/// Set a JSON value. Uses JSON.SET if module is available, otherwise SET.
pub async fn set_json_value(
    pool: &Pool,
    key: &str,
    path: &str,
    value: &str,
    use_module: bool,
) -> Result<(), AppError> {
    let mut conn = pool.get().await?;

    if use_module {
        redis::cmd("JSON.SET")
            .arg(key)
            .arg(path)
            .arg(value)
            .query_async::<()>(&mut conn)
            .await
            .map_err(|e| AppError::Redis(format!("JSON.SET failed: {e}")))?;
    } else {
        redis::cmd("SET")
            .arg(key)
            .arg(value)
            .query_async::<()>(&mut conn)
            .await
            .map_err(|e| AppError::Redis(format!("SET failed: {e}")))?;
    }

    Ok(())
}

// ─── HyperLogLog Operations ─────────────────────────────────────

/// Get `HyperLogLog` info: cardinality, encoding, size.
pub async fn get_hll_info(pool: &Pool, key: &str) -> Result<HllInfo, AppError> {
    let mut conn = pool.get().await?;

    let cardinality: u64 = redis::cmd("PFCOUNT")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("PFCOUNT failed: {e}")))?;

    // Get size using MEMORY USAGE (available since Redis 4.0)
    let size_bytes: u64 = redis::cmd("MEMORY")
        .arg("USAGE")
        .arg(key)
        .query_async(&mut conn)
        .await
        .unwrap_or(0);

    // Get encoding from OBJECT ENCODING
    let encoding: String = redis::cmd("OBJECT")
        .arg("ENCODING")
        .arg(key)
        .query_async(&mut conn)
        .await
        .unwrap_or_else(|_| "unknown".into());

    Ok(HllInfo {
        cardinality,
        encoding,
        size_bytes,
    })
}

/// Add elements to a `HyperLogLog`.
pub async fn add_hll_elements(
    pool: &Pool,
    key: &str,
    elements: &[String],
) -> Result<bool, AppError> {
    if elements.is_empty() {
        return Ok(false);
    }

    let mut conn = pool.get().await?;

    let changed: u64 = redis::cmd("PFADD")
        .arg(key)
        .arg(elements)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("PFADD failed: {e}")))?;

    Ok(changed == 1)
}

// ─── Bitmap Operations ──────────────────────────────────────────

/// Get bitmap info and a range of bits.
pub async fn get_bitmap_info(
    pool: &Pool,
    key: &str,
    byte_offset: u64,
    byte_count: u64,
) -> Result<BitmapInfo, AppError> {
    let mut conn = pool.get().await?;

    // Total set bits
    let bit_count: u64 = redis::cmd("BITCOUNT")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("BITCOUNT failed: {e}")))?;

    // Byte length
    let byte_length: u64 = redis::cmd("STRLEN")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("STRLEN failed: {e}")))?;

    // Read individual bits for the requested range
    let end_byte = (byte_offset + byte_count).min(byte_length);
    let total_bits = (end_byte.saturating_sub(byte_offset)) * 8;
    let capacity = usize::try_from(total_bits).unwrap_or(0);
    let mut bits = Vec::with_capacity(capacity);

    for bit_idx in (byte_offset * 8)..(end_byte * 8) {
        let bit: u8 = redis::cmd("GETBIT")
            .arg(key)
            .arg(bit_idx)
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Redis(format!("GETBIT failed: {e}")))?;
        bits.push(bit);
    }

    Ok(BitmapInfo {
        bit_count,
        byte_length,
        bits,
        offset: byte_offset,
    })
}

/// Set a single bit in a bitmap.
pub async fn set_bitmap_bit(
    pool: &Pool,
    key: &str,
    offset: u64,
    value: u8,
) -> Result<u8, AppError> {
    let mut conn = pool.get().await?;

    let old_value: u8 = redis::cmd("SETBIT")
        .arg(key)
        .arg(offset)
        .arg(value)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("SETBIT failed: {e}")))?;

    Ok(old_value)
}

// ─── Geospatial Operations ──────────────────────────────────────

/// Get all geospatial members with their coordinates.
pub async fn get_geo_members(pool: &Pool, key: &str) -> Result<Vec<GeoMember>, AppError> {
    let mut conn = pool.get().await?;

    // Get all members using ZRANGE (geo sets are sorted sets underneath)
    let members: Vec<String> = redis::cmd("ZRANGE")
        .arg(key)
        .arg(0)
        .arg(-1)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("ZRANGE failed: {e}")))?;

    if members.is_empty() {
        return Ok(vec![]);
    }

    // Get positions for all members
    let mut cmd = redis::cmd("GEOPOS");
    cmd.arg(key);
    for m in &members {
        cmd.arg(m);
    }

    let positions: Vec<Option<(f64, f64)>> = cmd
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("GEOPOS failed: {e}")))?;

    let mut result = Vec::new();
    for (member, pos) in members.into_iter().zip(positions) {
        if let Some((lon, lat)) = pos {
            result.push(GeoMember {
                member,
                longitude: lon,
                latitude: lat,
            });
        }
    }

    Ok(result)
}

/// Add a geospatial member.
pub async fn add_geo_member(
    pool: &Pool,
    key: &str,
    longitude: f64,
    latitude: f64,
    member: &str,
) -> Result<u64, AppError> {
    let mut conn = pool.get().await?;

    let added: u64 = redis::cmd("GEOADD")
        .arg(key)
        .arg(longitude)
        .arg(latitude)
        .arg(member)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("GEOADD failed: {e}")))?;

    Ok(added)
}

/// Get distance between two members.
pub async fn geo_distance(
    pool: &Pool,
    key: &str,
    member1: &str,
    member2: &str,
    unit: &str,
) -> Result<Option<f64>, AppError> {
    let mut conn = pool.get().await?;

    let distance: Option<f64> = redis::cmd("GEODIST")
        .arg(key)
        .arg(member1)
        .arg(member2)
        .arg(unit)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("GEODIST failed: {e}")))?;

    Ok(distance)
}

/// Remove geospatial members (uses ZREM since geo is a sorted set).
pub async fn remove_geo_members(
    pool: &Pool,
    key: &str,
    members: &[String],
) -> Result<u64, AppError> {
    if members.is_empty() {
        return Ok(0);
    }

    let mut conn = pool.get().await?;

    let removed: u64 = redis::cmd("ZREM")
        .arg(key)
        .arg(members)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("ZREM failed: {e}")))?;

    Ok(removed)
}
