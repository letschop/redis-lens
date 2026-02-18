// SPDX-License-Identifier: MIT
'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, HardDrive, Activity, Terminal, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CliConsole } from '@/components/modules/cli/CliConsole';

export default function CliPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: connectionId } = use(params);

  return (
    <div className="flex h-screen flex-col">
      {/* Header with navigation */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <nav className="flex items-center gap-1">
          <Link
            href={`/connections/${connectionId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <HardDrive className="h-3 w-3" />
            Keys
          </Link>
          <Link
            href={`/connections/${connectionId}/monitor`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Activity className="h-3 w-3" />
            Monitor
          </Link>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-accent-foreground">
            <Terminal className="h-3 w-3" />
            CLI
          </span>
          <Link
            href={`/connections/${connectionId}/pubsub`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Radio className="h-3 w-3" />
            Pub/Sub
          </Link>
        </nav>
      </div>

      {/* CLI Console */}
      <div className="flex-1 min-h-0 p-4">
        <CliConsole connectionId={connectionId} />
      </div>
    </div>
  );
}
