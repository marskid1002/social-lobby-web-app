'use client';

import { ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAppState } from '@/lib/state';

export default function BlockedUsersPage() {
  const { state, unblockUser } = useAppState();
  const blockedUsers = state.userBlocks
    .map((id) => state.users.find((user) => user.id === id))
    .filter((user) => user !== undefined);

  return (
    <div className="px-4 py-4">
      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        {blockedUsers.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-snow">
              <ShieldOff className="h-5 w-5 text-zinc-300" strokeWidth={1.75} />
            </div>
            <p className="text-sm font-semibold text-brand-ink">目前沒有封鎖任何人</p>
            <p className="mt-1 text-xs text-zinc-400">你封鎖的使用者會顯示在這裡</p>
          </div>
        ) : (
          blockedUsers.map((user, index) => (
            <div
              key={user.id}
              className={`flex items-center gap-3 px-4 py-3.5 ${index > 0 ? 'border-t border-brand-lavender' : ''}`}
            >
              <img
                src={user.avatarUrl}
                alt={user.nickname}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-ink">
                {user.nickname}
              </span>
              <button
                type="button"
                onClick={() => {
                  unblockUser(user.id);
                  toast.success('已解除封鎖');
                }}
                className="shrink-0 rounded-full bg-brand-sky/10 px-3 py-2 text-xs font-semibold text-brand-sky active:scale-95"
              >
                解除封鎖
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
