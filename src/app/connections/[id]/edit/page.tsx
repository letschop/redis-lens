// SPDX-License-Identifier: MIT

import EditConnectionClient from './_client';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function EditConnectionPage() {
  return <EditConnectionClient />;
}
