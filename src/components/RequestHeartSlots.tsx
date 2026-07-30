import { Heart } from 'lucide-react';

interface Props {
  total: number;
  confirmed: number;
  className?: string;
}

export function RequestHeartSlots({ total, confirmed, className = '' }: Props) {
  const safeTotal = Math.max(1, Math.min(20, Math.trunc(total) || 1));
  const safeConfirmed = Math.max(0, Math.min(safeTotal, Math.trunc(confirmed) || 0));

  return (
    <div
      className={`flex items-center gap-1.5 ${className}`}
      aria-label={`已確認上台 ${safeConfirmed} 位，共需要 ${safeTotal} 位`}
    >
      <div className="flex items-center gap-1">
        {Array.from({ length: safeTotal }, (_, index) => {
          const filled = index < safeConfirmed;
          return (
            <Heart
              key={index}
              className={`h-5 w-5 ${
                filled
                  ? 'fill-pink-500 text-pink-500'
                  : 'fill-transparent text-pink-300'
              }`}
              strokeWidth={2}
            />
          );
        })}
      </div>
      <span className="text-[11px] font-semibold text-zinc-500">
        已上台 {safeConfirmed}/{safeTotal}
      </span>
    </div>
  );
}
