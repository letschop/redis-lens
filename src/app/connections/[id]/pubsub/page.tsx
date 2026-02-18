// SPDX-License-Identifier: MIT

import PubSubClient from './_client';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function PubSubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PubSubClient params={params} />;
}
