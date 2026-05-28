'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';
import { useAppState } from '@/lib/state';

const CREDIT_PACKS = [
  { id: 1, credits: 30,   bonus: 0,   ntd: 300,  icon: '💗',  size: 'sm' },
  { id: 2, credits: 50,   bonus: 0,   ntd: 500,  icon: '💗',  size: 'sm' },
  { id: 3, credits: 100,  bonus: 10,  ntd: 900,  icon: '💝',  size: 'md' },
  { id: 4, credits: 200,  bonus: 25,  ntd: 1600, icon: '💝',  size: 'md' },
  { id: 5, credits: 500,  bonus: 80,  ntd: 3500, icon: '💖',  size: 'lg' },
  { id: 6, credits: 1000, bonus: 200, ntd: 6000, icon: '💖',  size: 'lg' },
] as const;

interface TierPlan {
  tier: string;
  label: string;
  ntd: number;
  color: string;
  highlight?: boolean;
  perks: string[];
}

const TIER_PLANS: TierPlan[] = [
  {
    tier: 'standard',
    label: '標準會員',
    ntd: 300,
    color: '#60A5FA',
    perks: ['每月 5 次邀請', '查看 3 位在線用戶', '廣場留言互動', '每次最多 3 人加入'],
  },
  {
    tier: 'premium',
    label: '進階會員',
    ntd: 1000,
    color: '#A78BFA',
    highlight: true,
    perks: ['每月 10 次邀請', '查看 10 位在線用戶', '廣場無限留言', '每次最多 5 人加入'],
  },
  {
    tier: 'vip',
    label: 'VIP 會員',
    ntd: 2500,
    color: '#F59E0B',
    perks: ['無限次邀請', '查看所有在線用戶', '私訊任何在線用戶', '人數無上限', '專屬客服'],
  },
];

const SIZE_STYLES = {
  sm: { icon: 'text-4xl', bg: 'bg-[#1a1a2e]', border: 'border-zinc-700' },
  md: { icon: 'text-5xl', bg: 'bg-[#1e1a2e]', border: 'border-purple-800/60' },
  lg: { icon: 'text-6xl', bg: 'bg-[#221a1a]', border: 'border-amber-800/60' },
};

export default function StorePage() {
  const router = useRouter();
  const { currentUser } = useAppState();
  const [selectedPack, setSelectedPack] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white pb-16">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0a0a14]/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5 text-white" strokeWidth={1.75} />
        </button>
        <h1 className="flex-1 text-base font-bold text-white tracking-wide">點數商城</h1>
        {/* Current balance */}
        <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5">
          <span className="text-base leading-none">💗</span>
          <span className="text-sm font-bold text-white">{currentUser?.credits ?? 0}</span>
        </div>
      </div>

      <div className="px-4 pt-5 flex flex-col gap-8">

        {/* ── Credit usage info ── */}
        <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-widest font-semibold">點數用途</p>
            <p className="text-sm text-white mt-0.5">額外邀請名額</p>
          </div>
          <span className="text-lg font-bold text-pink-400">35 💗</span>
        </div>

        {/* ── Credit packs ── */}
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-3">選擇點數包</p>
          <div className="grid grid-cols-2 gap-3">
            {CREDIT_PACKS.map((pack) => {
              const styles = SIZE_STYLES[pack.size];
              const isSelected = selectedPack === pack.id;
              return (
                <button
                  key={pack.id}
                  onClick={() => setSelectedPack(isSelected ? null : pack.id)}
                  className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all active:scale-[0.97] ${styles.bg} ${
                    isSelected ? 'border-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.3)]' : styles.border
                  }`}
                >
                  {isSelected && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                      <Check className="w-3 h-3 text-black" strokeWidth={3} />
                    </span>
                  )}
                  <span className={styles.icon}>{pack.icon}</span>
                  <div className="text-center">
                    <p className="text-lg font-bold text-white leading-tight">{pack.credits} 💗</p>
                    {pack.bonus > 0 && (
                      <p className="text-xs text-amber-400 font-semibold">+{pack.bonus} 贈送</p>
                    )}
                  </div>
                  <div className="mt-1 w-full bg-amber-400/10 border border-amber-400/30 rounded-xl py-1.5 text-center">
                    <span className="text-sm font-bold text-amber-300">NT$ {pack.ntd.toLocaleString()}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Buy button */}
          <button
            disabled
            className="mt-4 w-full py-4 rounded-2xl bg-amber-400/20 border border-amber-400/40 text-amber-300 font-bold text-base cursor-not-allowed"
          >
            即將開放購買 · 信用卡 / LINE Pay
          </button>
        </div>

        {/* ── Upgrade plans ── */}
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-3">升級會員方案</p>
          <div className="flex flex-col gap-3">
            {TIER_PLANS.map((plan) => (
              <div
                key={plan.tier}
                className={`rounded-2xl border p-4 ${
                  plan.highlight
                    ? 'bg-[#1a1228] border-purple-500/60 shadow-[0_0_20px_rgba(167,139,250,0.15)]'
                    : 'bg-[#0f0f1a] border-white/10'
                }`}
              >
                {plan.highlight && (
                  <span className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-300 border border-purple-500/40 mb-2">
                    最熱門
                  </span>
                )}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <p className="text-base font-bold" style={{ color: plan.color }}>
                    {plan.label}
                  </p>
                  <div className="text-right shrink-0">
                    <span className="text-lg font-bold text-white">NT$ {plan.ntd.toLocaleString()}</span>
                    <span className="text-xs text-zinc-500 block">/ 月</span>
                  </div>
                </div>
                <ul className="flex flex-col gap-1.5 mb-4">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-center gap-2 text-sm text-zinc-300">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: plan.color + '30' }}>
                        <Check className="w-2.5 h-2.5" style={{ color: plan.color }} strokeWidth={3} />
                      </span>
                      {perk}
                    </li>
                  ))}
                </ul>
                <button
                  disabled
                  className="w-full py-3 rounded-xl font-bold text-sm cursor-not-allowed"
                  style={{ backgroundColor: plan.color + '20', color: plan.color, border: `1px solid ${plan.color}40` }}
                >
                  即將開放
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="text-xs text-zinc-600 text-center pb-4">
          點數不會過期 · 升級方案按月計費，隨時可取消
        </p>
      </div>
    </div>
  );
}
