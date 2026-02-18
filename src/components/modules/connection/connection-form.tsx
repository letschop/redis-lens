// SPDX-License-Identifier: MIT
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, Loader2, XCircle, Link as LinkIcon, Shield } from 'lucide-react';
import {
  createDefaultProfile,
  type ConnectionProfile,
  type SshConfig,
  type SshAuth,
  type ServerInfoSummary,
} from '@/lib/api/types';
import { useConnectionStore } from '@/lib/stores/connection-store';
import { connectionParseUri } from '@/lib/api/commands';

interface ConnectionFormProps {
  initialProfile?: ConnectionProfile;
  onSaved?: (profile: ConnectionProfile) => void;
  onCancel?: () => void;
}

type TestStatus =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'success'; info: ServerInfoSummary }
  | { state: 'error'; message: string };

export function ConnectionForm({ initialProfile, onSaved, onCancel }: ConnectionFormProps) {
  const [profile, setProfile] = useState<ConnectionProfile>(
    initialProfile ?? createDefaultProfile(),
  );
  const [testStatus, setTestStatus] = useState<TestStatus>({ state: 'idle' });
  const [uriInput, setUriInput] = useState('');
  const [saving, setSaving] = useState(false);

  const { saveProfile, testConnection } = useConnectionStore();

  const updateField = <K extends keyof ConnectionProfile>(key: K, value: ConnectionProfile[K]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const handleParseUri = async () => {
    if (!uriInput.trim()) return;
    try {
      const parsed = await connectionParseUri(uriInput.trim());
      setProfile((prev) => ({
        ...prev,
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        password: parsed.password,
        database: parsed.database,
        tls: { ...prev.tls, enabled: parsed.tls.enabled },
      }));
    } catch {
      // URI parsing failed — ignore silently, user can fill manually
    }
  };

  const handleTest = async () => {
    setTestStatus({ state: 'testing' });
    try {
      const info = await testConnection(profile);
      setTestStatus({ state: 'success', info });
    } catch (err) {
      setTestStatus({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleSave = async () => {
    if (!profile.name.trim()) {
      setProfile((prev) => ({ ...prev, name: `${prev.host}:${prev.port}` }));
    }
    setSaving(true);
    try {
      const finalProfile = {
        ...profile,
        name: profile.name.trim() || `${profile.host}:${profile.port}`,
      };
      const saved = await saveProfile(finalProfile);
      onSaved?.(saved);
    } catch {
      // Error handled by store
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* URI Paste */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            Quick Connect
          </CardTitle>
          <CardDescription>Paste a Redis URI to auto-fill the form</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="redis://:password@host:6379/0"
              value={uriInput}
              onChange={(e) => setUriInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleParseUri();
                }
              }}
            />
            <Button variant="secondary" onClick={() => void handleParseUri()}>
              Parse
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Connection Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connection Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Connection Name</Label>
            <Input
              id="name"
              placeholder="My Redis Server"
              value={profile.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
          </div>

          {/* Host + Port */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="host">Host</Label>
              <Input
                id="host"
                placeholder="127.0.0.1"
                value={profile.host}
                onChange={(e) => updateField('host', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                min={1}
                max={65535}
                value={profile.port}
                onChange={(e) => updateField('port', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Username + Password */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username (optional)</Label>
              <Input
                id="username"
                placeholder="default"
                value={profile.username ?? ''}
                onChange={(e) => updateField('username', e.target.value || undefined)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password (optional)</Label>
              <Input
                id="password"
                type="password"
                value={profile.password ?? ''}
                onChange={(e) => updateField('password', e.target.value || undefined)}
              />
            </div>
          </div>

          {/* Database */}
          <div className="space-y-2 max-w-[120px]">
            <Label htmlFor="database">Database</Label>
            <Input
              id="database"
              type="number"
              min={0}
              max={15}
              value={profile.database}
              onChange={(e) => updateField('database', Number(e.target.value))}
            />
          </div>

          <Separator />

          {/* TLS Toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="tls"
              checked={profile.tls.enabled}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  tls: { ...prev.tls, enabled: e.target.checked },
                }))
              }
              className="h-4 w-4 rounded border-border"
            />
            <Label htmlFor="tls" className="font-normal">
              Use TLS / SSL
            </Label>
          </div>

          {/* SSH Tunnel Toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="ssh-enabled"
              checked={profile.ssh?.enabled ?? false}
              onChange={(e) => {
                const enabled = e.target.checked;
                setProfile((prev) => ({
                  ...prev,
                  ssh: enabled
                    ? (prev.ssh ?? {
                        enabled: true,
                        host: '',
                        port: 22,
                        username: '',
                        auth: { type: 'password' as const, password: '' },
                      })
                    : prev.ssh
                      ? { ...prev.ssh, enabled: false }
                      : undefined,
                }));
              }}
              className="h-4 w-4 rounded border-border"
            />
            <Label htmlFor="ssh-enabled" className="font-normal flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Use SSH Tunnel
            </Label>
          </div>

          {/* SSH Configuration (shown when enabled) */}
          {profile.ssh?.enabled && (
            <SshConfigSection
              ssh={profile.ssh}
              onChange={(ssh) => setProfile((prev) => ({ ...prev, ssh }))}
            />
          )}

          {/* Read-only Toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="readonly"
              checked={profile.readonly}
              onChange={(e) => updateField('readonly', e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <Label htmlFor="readonly" className="font-normal">
              Read-only mode (blocks write commands)
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Test Result */}
      {testStatus.state !== 'idle' && (
        <Card>
          <CardContent className="p-4">
            {testStatus.state === 'testing' && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing connection...
              </div>
            )}
            {testStatus.state === 'success' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Connection successful
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline">Redis {testStatus.info.redisVersion}</Badge>
                  <Badge variant="outline">{testStatus.info.mode}</Badge>
                  <Badge variant="outline">{testStatus.info.usedMemoryHuman}</Badge>
                  <Badge variant="outline">{testStatus.info.dbSize} keys</Badge>
                </div>
              </div>
            )}
            {testStatus.state === 'error' && (
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" />
                {testStatus.message}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => void handleTest()} disabled={!profile.host}>
          Test Connection
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving || !profile.host}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Connection'
          )}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── SSH Config Sub-Component ─────────────────────────────────────

interface SshConfigSectionProps {
  ssh: SshConfig;
  onChange: (ssh: SshConfig) => void;
}

function SshConfigSection({ ssh, onChange }: SshConfigSectionProps) {
  const updateSsh = <K extends keyof SshConfig>(key: K, value: SshConfig[K]) => {
    onChange({ ...ssh, [key]: value });
  };

  const updateAuth = (auth: SshAuth) => {
    onChange({ ...ssh, auth });
  };

  const authType = ssh.auth.type;

  return (
    <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
      {/* SSH Host + Port */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="ssh-host">SSH Host</Label>
          <Input
            id="ssh-host"
            placeholder="bastion.example.com"
            value={ssh.host}
            onChange={(e) => updateSsh('host', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ssh-port">SSH Port</Label>
          <Input
            id="ssh-port"
            type="number"
            min={1}
            max={65535}
            value={ssh.port}
            onChange={(e) => updateSsh('port', Number(e.target.value))}
          />
        </div>
      </div>

      {/* SSH Username */}
      <div className="space-y-2">
        <Label htmlFor="ssh-username">SSH Username</Label>
        <Input
          id="ssh-username"
          placeholder="ubuntu"
          value={ssh.username}
          onChange={(e) => updateSsh('username', e.target.value)}
        />
      </div>

      {/* Auth Method Selector */}
      <div className="space-y-2">
        <Label>Authentication Method</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="ssh-auth-type"
              value="password"
              checked={authType === 'password'}
              onChange={() => updateAuth({ type: 'password', password: '' })}
              className="h-4 w-4"
            />
            Password
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="ssh-auth-type"
              value="private_key"
              checked={authType === 'private_key'}
              onChange={() => updateAuth({ type: 'private_key', keyPath: '' })}
              className="h-4 w-4"
            />
            Private Key
          </label>
        </div>
      </div>

      {/* Auth Fields */}
      {authType === 'password' && (
        <div className="space-y-2">
          <Label htmlFor="ssh-password">SSH Password</Label>
          <Input
            id="ssh-password"
            type="password"
            value={ssh.auth.type === 'password' ? ssh.auth.password : ''}
            onChange={(e) => updateAuth({ type: 'password', password: e.target.value })}
          />
        </div>
      )}

      {authType === 'private_key' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ssh-key-path">Private Key Path</Label>
            <Input
              id="ssh-key-path"
              placeholder="~/.ssh/id_rsa"
              value={ssh.auth.type === 'private_key' ? ssh.auth.keyPath : ''}
              onChange={(e) =>
                updateAuth({
                  type: 'private_key',
                  keyPath: e.target.value,
                  passphrase: ssh.auth.type === 'private_key' ? ssh.auth.passphrase : undefined,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ssh-passphrase">Passphrase (optional)</Label>
            <Input
              id="ssh-passphrase"
              type="password"
              value={ssh.auth.type === 'private_key' ? (ssh.auth.passphrase ?? '') : ''}
              onChange={(e) =>
                updateAuth({
                  type: 'private_key',
                  keyPath: ssh.auth.type === 'private_key' ? ssh.auth.keyPath : '',
                  passphrase: e.target.value || undefined,
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
