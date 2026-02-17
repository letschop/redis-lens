// SPDX-License-Identifier: MIT
'use client';

import { ConnectionList } from '@/components/modules/connection/connection-list';

export default function HomePage() {
  return (
    <main className="container max-w-3xl py-8 px-4 mx-auto">
      <ConnectionList />
    </main>
  );
}
