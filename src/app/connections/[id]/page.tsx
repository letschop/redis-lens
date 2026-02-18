// SPDX-License-Identifier: MIT

import ConnectionDetailClient from './_client';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function ConnectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <ConnectionDetailClient params={params} />;
}
