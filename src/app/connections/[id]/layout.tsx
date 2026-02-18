// SPDX-License-Identifier: MIT

// Provides a static param so `output: "export"` succeeds.
// Tauri always starts at "/" and navigates client-side, so the
// actual connection ID is resolved at runtime, not build time.
export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function ConnectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
