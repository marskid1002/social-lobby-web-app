import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'JUGA',
  description: '今晚有局，因為有你',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'JUGA',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#070812',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className="h-full">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-brand-snow">
        <div className="mx-auto max-w-[430px] min-h-screen bg-brand-snow relative overflow-x-hidden shadow-2xl ring-1 ring-white/5">
          {children}
          <Toaster position="top-center" richColors />
        </div>
      </body>
    </html>
  );
}
