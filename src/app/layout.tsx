// SPDX-License-Identifier: MIT

'use client';

import '@/styles/globals.css';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { ErrorBoundary } from '@/components/layout/error-boundary';
import { Toaster } from '@/components/ui/sonner';
import { CommandPalette } from '@/components/layout/command-palette';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>RedisLens</title>
      </head>
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <CommandPalette />
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
