// SPDX-License-Identifier: MIT

/**
 * Structured error from the Rust backend.
 * Mirrors the AppError enum defined in src-tauri/src/utils/errors.rs.
 */
export class AppError extends Error {
  constructor(
    public readonly kind: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get isConnectionError(): boolean {
    return this.kind === 'Connection';
  }

  get isNotFound(): boolean {
    return this.kind === 'NotFound';
  }

  get isPermissionDenied(): boolean {
    return this.kind === 'PermissionDenied';
  }

  get isValidationError(): boolean {
    return this.kind === 'InvalidInput';
  }

  get isTimeout(): boolean {
    return this.kind === 'Timeout';
  }
}

/** Health check response from the Rust backend. */
export interface HealthResponse {
  status: string;
  version: string;
}

// ─── Connection Types ──────────────────────────────────────────

export type ConnectionType = 'standalone' | 'cluster' | 'sentinel';

export interface TlsConfig {
  enabled: boolean;
  caCertPath?: string;
  clientCertPath?: string;
  clientKeyPath?: string;
  acceptSelfSigned: boolean;
}

export interface SshAuthPassword {
  type: 'password';
  password: string;
}

export interface SshAuthPrivateKey {
  type: 'private_key';
  keyPath: string;
  passphrase?: string;
}

export interface SshAuthAgent {
  type: 'agent';
}

export type SshAuth = SshAuthPassword | SshAuthPrivateKey | SshAuthAgent;

export interface SshConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  auth: SshAuth;
  localPort?: number;
}

export interface PoolConfig {
  maxSize: number;
  minIdle?: number;
  idleTimeoutSecs?: number;
  maxLifetimeSecs?: number;
  connectionTimeoutSecs: number;
}

export interface TimeoutConfig {
  connectSecs: number;
  readSecs: number;
  writeSecs: number;
}

/** Full connection profile persisted to disk. */
export interface ConnectionProfile {
  id: string;
  name: string;
  color?: string;
  connectionType: ConnectionType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  database: number;
  tls: TlsConfig;
  ssh?: SshConfig;
  pool: PoolConfig;
  timeout: TimeoutConfig;
  readonly: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Summary of Redis server info returned after a successful connection. */
export interface ServerInfoSummary {
  redisVersion: string;
  mode: string;
  os: string;
  uptimeInSeconds: number;
  connectedClients: number;
  usedMemoryHuman: string;
  dbSize: number;
}

/** Connection state discriminated union. */
export type ConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; serverInfo: ServerInfoSummary }
  | { status: 'error'; message: string; retryCount: number };

// ─── Browser Types ───────────────────────────────────────────

/** Redis key type classification. */
export type RedisKeyType = 'string' | 'list' | 'set' | 'zset' | 'hash' | 'stream' | string;

/** TTL state for a Redis key. */
export type Ttl =
  | { type: 'persistent' }
  | { type: 'seconds'; value: number }
  | { type: 'missing' };

/** Metadata for a single Redis key. */
export interface KeyInfo {
  key: string;
  keyType: RedisKeyType;
  ttl: Ttl;
  sizeBytes?: number;
  encoding?: string;
  length?: number;
}

/** Result of a single SCAN iteration. */
export interface ScanResult {
  cursor: number;
  keys: string[];
  finished: boolean;
  scannedCount: number;
  totalEstimate: number;
}

/** A node in the key namespace tree. */
export interface KeyNode {
  name: string;
  fullPath: string;
  isLeaf: boolean;
  keyType?: RedisKeyType;
  ttl?: Ttl;
  childrenCount: number;
  depth: number;
}

/** Flattened tree node for virtual scrolling. */
export interface FlatTreeNode {
  id: string;
  node: KeyNode;
  expanded: boolean;
  visible: boolean;
  indent: number;
}

// ─── Editor Types ───────────────────────────────────────────

/** String value returned by the editor (may be text or base64-encoded binary). */
export interface StringValue {
  text?: string;
  base64?: string;
  sizeBytes: number;
  isBinary: boolean;
}

/** A single field-value pair in a Redis hash. */
export interface HashField {
  field: string;
  value: string;
}

/** Paginated result from HSCAN. */
export interface HashScanResult {
  cursor: number;
  fields: HashField[];
  finished: boolean;
}

/** A single element in a Redis list. */
export interface ListElement {
  index: number;
  value: string;
}

/** Paginated result from SSCAN. */
export interface SetScanResult {
  cursor: number;
  members: string[];
  finished: boolean;
}

/** TTL metadata for a key. */
export interface TtlInfo {
  seconds: number;
  isPersistent: boolean;
  isMissing: boolean;
}

// ─── Sorted Set Types ─────────────────────────────────────────

/** A single member-score pair in a sorted set. */
export interface ZSetMember {
  member: string;
  score: number;
}

/** Paginated result from ZSCAN. */
export interface ZSetScanResult {
  cursor: number;
  members: ZSetMember[];
  finished: boolean;
}

// ─── Stream Types ─────────────────────────────────────────────

/** A single stream entry (ID + field-value pairs). */
export interface StreamEntry {
  id: string;
  fields: [string, string][];
}

/** Result of reading a range of stream entries. */
export interface StreamRangeResult {
  entries: StreamEntry[];
  totalLength: number;
}

/** Consumer group info from XINFO GROUPS. */
export interface ConsumerGroupInfo {
  name: string;
  consumers: number;
  pending: number;
  lastDeliveredId: string;
}

/** Full stream info. */
export interface StreamInfo {
  length: number;
  firstEntryId?: string;
  lastEntryId?: string;
  groups: ConsumerGroupInfo[];
}

// ─── JSON Type ────────────────────────────────────────────────

/** JSON value from RedisJSON module or string fallback. */
export interface JsonValue {
  json: string;
  isModule: boolean;
}

// ─── HyperLogLog Type ────────────────────────────────────────

/** HyperLogLog information. */
export interface HllInfo {
  cardinality: number;
  encoding: string;
  sizeBytes: number;
}

// ─── Bitmap Type ──────────────────────────────────────────────

/** Bitmap information and data. */
export interface BitmapInfo {
  bitCount: number;
  byteLength: number;
  bits: number[];
  offset: number;
}

// ─── Geospatial Types ────────────────────────────────────────

/** A single geospatial member with coordinates. */
export interface GeoMember {
  member: string;
  longitude: number;
  latitude: number;
}

// ─── Default Factories ─────────────────────────────────────────

export function createDefaultProfile(
  overrides: Partial<ConnectionProfile> = {},
): ConnectionProfile {
  return {
    id: crypto.randomUUID(),
    name: '',
    connectionType: 'standalone',
    host: '127.0.0.1',
    port: 6379,
    database: 0,
    tls: {
      enabled: false,
      acceptSelfSigned: false,
    },
    pool: {
      maxSize: 8,
      connectionTimeoutSecs: 5,
      idleTimeoutSecs: 300,
      maxLifetimeSecs: 1800,
    },
    timeout: {
      connectSecs: 5,
      readSecs: 10,
      writeSecs: 10,
    },
    readonly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
