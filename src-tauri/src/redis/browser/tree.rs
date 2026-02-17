// SPDX-License-Identifier: MIT

use std::collections::BTreeMap;

use super::model::KeyNode;

/// Internal tree node used during construction.
///
/// Uses `BTreeMap` for deterministic (sorted) child ordering.
#[derive(Debug)]
struct TreeNode {
    name: String,
    full_path: String,
    children: BTreeMap<String, TreeNode>,
    is_leaf: bool,
}

/// Build a key namespace tree from a flat list of Redis keys.
///
/// Keys are split by the delimiter (typically `:`) into a hierarchical tree.
/// For example, `["user:1", "user:2", "session:abc"]` with delimiter `:` produces:
///
/// ```text
/// root
/// ├── user/ (2 children)
/// │   ├── 1 (leaf)
/// │   └── 2 (leaf)
/// └── session/ (1 child)
///     └── abc (leaf)
/// ```
///
/// The result is a flattened list of `KeyNode` items at the root level.
/// Children are not expanded — the frontend handles lazy expansion.
pub fn build_key_tree(keys: &[String], delimiter: &str) -> Vec<KeyNode> {
    let mut root = TreeNode {
        name: String::new(),
        full_path: String::new(),
        children: BTreeMap::new(),
        is_leaf: false,
    };

    for key in keys {
        let segments: Vec<&str> = key.split(delimiter).collect();
        insert_into_tree(&mut root, &segments, key, delimiter);
    }

    // Flatten root's direct children only (depth 0)
    flatten_children(&root, 0)
}

/// Insert a key into the tree by splitting it into path segments.
fn insert_into_tree(node: &mut TreeNode, segments: &[&str], full_key: &str, delimiter: &str) {
    if segments.is_empty() {
        return;
    }

    if segments.len() == 1 {
        // Leaf node — this is an actual Redis key
        let entry = node
            .children
            .entry(segments[0].to_string())
            .or_insert_with(|| TreeNode {
                name: segments[0].to_string(),
                full_path: full_key.to_string(),
                children: BTreeMap::new(),
                is_leaf: false,
            });
        entry.is_leaf = true;
        entry.full_path = full_key.to_string();
    } else {
        // Namespace node
        let prefix = if node.full_path.is_empty() {
            segments[0].to_string()
        } else {
            format!("{}{delimiter}{}", node.full_path, segments[0])
        };

        let child = node
            .children
            .entry(segments[0].to_string())
            .or_insert_with(|| TreeNode {
                name: segments[0].to_string(),
                full_path: prefix,
                children: BTreeMap::new(),
                is_leaf: false,
            });

        insert_into_tree(child, &segments[1..], full_key, delimiter);
    }
}

/// Flatten the direct children of a tree node into `KeyNode` items.
///
/// Namespace (folder) nodes include their children count but the children
/// themselves are not recursively flattened — the frontend lazily expands them.
fn flatten_children(node: &TreeNode, depth: u32) -> Vec<KeyNode> {
    let mut result = Vec::new();

    for child in node.children.values() {
        let children_count = if child.is_leaf && child.children.is_empty() {
            0
        } else {
            child.children.len() as u64
        };

        result.push(KeyNode {
            name: child.name.clone(),
            full_path: child.full_path.clone(),
            is_leaf: child.is_leaf && child.children.is_empty(),
            key_type: None, // Populated by frontend via batch metadata loading
            ttl: None,
            children_count,
            depth,
        });
    }

    result
}

/// Get the children of a specific namespace path from a flat key list.
///
/// Given keys and a prefix like `"user"`, returns the direct children
/// under that namespace at the correct depth.
pub fn get_children_for_prefix(
    keys: &[String],
    prefix: &str,
    delimiter: &str,
    depth: u32,
) -> Vec<KeyNode> {
    let prefix_with_delim = format!("{prefix}{delimiter}");

    let mut sub_root = TreeNode {
        name: String::new(),
        full_path: prefix.to_string(),
        children: BTreeMap::new(),
        is_leaf: false,
    };

    for key in keys {
        if let Some(suffix) = key.strip_prefix(&prefix_with_delim) {
            let segments: Vec<&str> = suffix.split(delimiter).collect();
            insert_into_subtree(&mut sub_root, &segments, key, prefix, delimiter);
        }
    }

    flatten_children(&sub_root, depth)
}

/// Insert segments into a subtree rooted at a specific prefix.
fn insert_into_subtree(
    node: &mut TreeNode,
    segments: &[&str],
    full_key: &str,
    prefix: &str,
    delimiter: &str,
) {
    if segments.is_empty() {
        return;
    }

    if segments.len() == 1 {
        let entry = node
            .children
            .entry(segments[0].to_string())
            .or_insert_with(|| TreeNode {
                name: segments[0].to_string(),
                full_path: full_key.to_string(),
                children: BTreeMap::new(),
                is_leaf: false,
            });
        entry.is_leaf = true;
        entry.full_path = full_key.to_string();
    } else {
        let child_path = format!("{prefix}{delimiter}{}", segments[0]);

        let child = node
            .children
            .entry(segments[0].to_string())
            .or_insert_with(|| TreeNode {
                name: segments[0].to_string(),
                full_path: child_path,
                children: BTreeMap::new(),
                is_leaf: false,
            });

        let new_prefix = format!("{prefix}{delimiter}{}", segments[0]);
        insert_into_subtree(child, &segments[1..], full_key, &new_prefix, delimiter);
    }
}

/// Count the total leaf keys in a tree node.
pub fn count_leaves(keys: &[String], prefix: &str, delimiter: &str) -> u64 {
    let prefix_with_delim = format!("{prefix}{delimiter}");
    keys.iter()
        .filter(|k| k.starts_with(&prefix_with_delim))
        .count() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_tree_simple() {
        let keys = vec![
            "user:1".to_string(),
            "user:2".to_string(),
            "session:abc".to_string(),
        ];
        let tree = build_key_tree(&keys, ":");

        assert_eq!(tree.len(), 2); // user/, session/
        assert_eq!(tree[0].name, "session");
        assert_eq!(tree[1].name, "user");
    }

    #[test]
    fn test_build_tree_nested() {
        let keys = vec![
            "app:user:1".to_string(),
            "app:user:2".to_string(),
            "app:session:abc".to_string(),
        ];
        let tree = build_key_tree(&keys, ":");

        assert_eq!(tree.len(), 1); // app/
        assert_eq!(tree[0].name, "app");
        assert!(!tree[0].is_leaf);
        assert_eq!(tree[0].children_count, 2); // user/, session/
    }

    #[test]
    fn test_build_tree_leaf_only() {
        let keys = vec!["counter".to_string(), "version".to_string()];
        let tree = build_key_tree(&keys, ":");

        assert_eq!(tree.len(), 2);
        assert!(tree[0].is_leaf); // counter
        assert!(tree[1].is_leaf); // version
        assert_eq!(tree[0].children_count, 0);
    }

    #[test]
    fn test_build_tree_mixed() {
        let keys = vec![
            "user:1".to_string(),
            "user:profile:1".to_string(),
            "counter".to_string(),
        ];
        let tree = build_key_tree(&keys, ":");

        // Root level: counter (leaf), user/ (folder)
        assert_eq!(tree.len(), 2);

        let counter = &tree[0];
        assert_eq!(counter.name, "counter");
        assert!(counter.is_leaf);

        let user = &tree[1];
        assert_eq!(user.name, "user");
        assert!(!user.is_leaf); // user has children: "1" and "profile/"
        assert_eq!(user.children_count, 2);
    }

    #[test]
    fn test_build_tree_empty() {
        let keys: Vec<String> = vec![];
        let tree = build_key_tree(&keys, ":");
        assert!(tree.is_empty());
    }

    #[test]
    fn test_build_tree_single_key() {
        let keys = vec!["simple".to_string()];
        let tree = build_key_tree(&keys, ":");

        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].name, "simple");
        assert!(tree[0].is_leaf);
        assert_eq!(tree[0].full_path, "simple");
    }

    #[test]
    fn test_build_tree_depth() {
        let keys = vec!["a:b:c".to_string()];
        let tree = build_key_tree(&keys, ":");

        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].depth, 0);
    }

    #[test]
    fn test_get_children_for_prefix() {
        let keys = vec![
            "user:1".to_string(),
            "user:2".to_string(),
            "user:profile:1".to_string(),
            "session:abc".to_string(),
        ];

        let children = get_children_for_prefix(&keys, "user", ":", 1);

        assert_eq!(children.len(), 3); // 1, 2, profile/
        assert_eq!(children[0].name, "1");
        assert!(children[0].is_leaf);
        assert_eq!(children[0].depth, 1);
        assert_eq!(children[1].name, "2");
        assert!(children[1].is_leaf);
        assert_eq!(children[2].name, "profile");
        assert!(!children[2].is_leaf);
    }

    #[test]
    fn test_count_leaves() {
        let keys = vec![
            "user:1".to_string(),
            "user:2".to_string(),
            "user:profile:1".to_string(),
            "session:abc".to_string(),
        ];

        assert_eq!(count_leaves(&keys, "user", ":"), 3);
        assert_eq!(count_leaves(&keys, "session", ":"), 1);
        assert_eq!(count_leaves(&keys, "nonexistent", ":"), 0);
    }

    #[test]
    fn test_sorted_output() {
        let keys = vec![
            "z:key".to_string(),
            "a:key".to_string(),
            "m:key".to_string(),
        ];
        let tree = build_key_tree(&keys, ":");

        // BTreeMap ensures sorted order
        assert_eq!(tree[0].name, "a");
        assert_eq!(tree[1].name, "m");
        assert_eq!(tree[2].name, "z");
    }

    #[test]
    fn test_key_that_is_both_leaf_and_namespace() {
        // "user" is a key, and "user:1" also exists
        let keys = vec!["user".to_string(), "user:1".to_string()];
        let tree = build_key_tree(&keys, ":");

        assert_eq!(tree.len(), 1);
        let user = &tree[0];
        assert_eq!(user.name, "user");
        // It has children so it's not a pure leaf
        assert!(!user.is_leaf);
        assert_eq!(user.children_count, 1);
    }

    #[test]
    fn test_custom_delimiter() {
        let keys = vec!["app/users/1".to_string(), "app/users/2".to_string()];
        let tree = build_key_tree(&keys, "/");

        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].name, "app");
    }
}
