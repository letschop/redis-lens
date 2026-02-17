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
