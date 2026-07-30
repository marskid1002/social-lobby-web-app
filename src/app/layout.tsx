import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'Social Lobby',
  description: '今晚一起出去吧',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Social Lobby',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#8BD8F1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className="h-full">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/icons/icon-192" />
      </head>
      <body className="min-h-full bg-brand-snow">
        <div className="mx-auto max-w-[430px] min-h-screen bg-brand-snow relative overflow-x-hidden shadow-2xl">
          {children}
          <Toaster position="top-center" richColors />
        </div>
      </body>
    </html>
  );
}
