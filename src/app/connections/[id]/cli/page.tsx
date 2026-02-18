// SPDX-License-Identifier: MIT

import CliClient from './_client';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function CliPage({ params }: { params: Promise<{ id: string }> }) {
  return <CliClient params={params} />;
}
