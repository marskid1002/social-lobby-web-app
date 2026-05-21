'use client';

import { useState } from 'react';
import { PostRequestSheet } from '@/components/PostRequestSheet';

export default function NewRequestPage() {
  const [open, setOpen] = useState(true);
  return <PostRequestSheet open={open} onClose={() => setOpen(false)} />;
}
