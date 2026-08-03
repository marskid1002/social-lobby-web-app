'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = localStorage.getItem('sl_state_v1');
      const userId = raw ? JSON.parse(raw).currentUserId : null;
      if (userId) {
        router.replace('/lobby/explore');
      } else {
        router.replace('/login');
      }
    } catch {
      router.replace('/login');
    }
  }, [router]);

  return <div className="min-h-screen bg-brand-snow" aria-hidden="true" />;
}
