import { notFound } from 'next/navigation';
import { Crown, Home, MessageCircle, Plus, Search, UserRound } from 'lucide-react';

const people = [
  { name: '小安', area: '信義區', time: '剛剛', image: 'https://randomuser.me/api/portraits/women/44.jpg' },
  { name: 'Queen', area: '中山區', time: '2 分鐘前', image: 'https://randomuser.me/api/portraits/women/65.jpg' },
  { name: '婷婷', area: '大安區', time: '5 分鐘前', image: 'https://randomuser.me/api/portraits/women/32.jpg' },
  { name: '安妮', area: '松山區', time: '8 分鐘前', image: 'https://randomuser.me/api/portraits/women/68.jpg' },
  { name: '妍妍', area: '信義區', time: '12 分鐘前', image: 'https://randomuser.me/api/portraits/women/47.jpg' },
  { name: '小雨', area: '中正區', time: '15 分鐘前', image: 'https://randomuser.me/api/portraits/women/79.jpg' },
];

export default function OnlineTilesPreviewPage() {
  // 僅供本機快速檢視 UI；正式建置不公開免登入預覽頁。
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] bg-brand-snow pb-24 text-brand-ink">
      <header className="bg-white px-4 pb-4 pt-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-purple-500">JUGA</p>
        <h1 className="mt-1 text-xl font-black">今晚想遇見誰？</h1>
        <p className="mt-1 text-xs text-zinc-400">本機免登入預覽 · 方塊人物磚版本</p>
      </header>

      <section>
        <div className="flex items-center gap-2 border-y border-zinc-100 bg-white px-4 py-3">
          <Crown size={15} className="text-amber-500" />
          <h2 className="text-sm font-bold uppercase tracking-wider">今晚在線</h2>
          <span className="ml-auto text-xs font-semibold text-zinc-400">{people.length} 位</span>
        </div>

        <div className="mx-auto grid w-full max-w-[310px] grid-cols-2 justify-items-center gap-1.5 p-3 [@media(min-height:700px)]:max-w-[346px] [@media(min-height:700px)]:gap-3">
          {people.map((person) => (
            <article
              key={person.name}
              className="group w-full max-w-[140px] overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5 [@media(min-height:700px)]:max-w-[155px]"
            >
              <div className="relative aspect-[7/6] overflow-hidden bg-zinc-100 [@media(min-height:700px)]:aspect-[4/5]">
                <img src={person.image} alt={person.name} className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_2px_rgba(255,255,255,0.9)]" role="status" aria-label="今晚在線" />
              </div>
              <div className="p-1.5">
                <div className="flex items-center justify-between gap-1.5">
                  <p className="min-w-0 truncate text-[10px] text-zinc-500">{person.area}</p>
                  <p className="min-w-0 truncate text-xs font-bold text-brand-ink">{person.name}</p>
                </div>
                <button type="button" className="mt-1 w-full rounded-md bg-pink-50 px-2 py-1 text-[10px] font-bold text-brand-pink">查看</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex h-[68px] w-full max-w-[430px] items-center justify-around border-t border-zinc-100 bg-white/95 px-3 pb-1 shadow-[0_-8px_24px_rgba(0,0,0,0.05)] backdrop-blur-xl">
        <span className="flex flex-col items-center gap-1 text-purple-500"><Home size={20} /><small className="text-[10px] font-bold">首頁</small></span>
        <span className="flex flex-col items-center gap-1 text-zinc-400"><Search size={20} /><small className="text-[10px]">探索</small></span>
        <span className="-mt-7 flex h-12 w-12 items-center justify-center rounded-full bg-purple-500 text-white shadow-lg"><Plus size={23} /></span>
        <span className="flex flex-col items-center gap-1 text-zinc-400"><MessageCircle size={20} /><small className="text-[10px]">聊天</small></span>
        <span className="flex flex-col items-center gap-1 text-zinc-400"><UserRound size={20} /><small className="text-[10px]">我的</small></span>
      </nav>
    </main>
  );
}
