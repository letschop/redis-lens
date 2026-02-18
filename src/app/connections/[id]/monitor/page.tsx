// SPDX-License-Identifier: MIT

import MonitorClient from './_client';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function MonitorPage({ params }: { params: Promise<{ id: string }> }) {
  return <MonitorClient params={params} />;
}
