'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UpdatesPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/inbox'); }, []);
  return null;
}
