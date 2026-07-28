import LegalBackButton from '@/components/legal/legal-back-button';
import { TERMS_SECTIONS, TERMS_VERSION } from '@/lib/legal';

export const metadata = { title: '平台服務條款暨使用規章 · Social Lobby' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-brand-snow">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-brand-lavender px-4 py-3">
        <LegalBackButton />
        <h1 className="text-base font-bold text-brand-ink mt-1">平台服務條款暨使用規章</h1>
        <p className="mt-0.5 text-xs text-zinc-400">版本：{TERMS_VERSION}</p>
      </div>
      <main className="mx-auto max-w-2xl px-5 py-6 text-sm leading-7 text-brand-ink">
        {TERMS_SECTIONS.map((section) => (
          <section key={section.title} className="mb-7 rounded-2xl border border-brand-lavender bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-bold">{section.title}</h2>
            <div className="space-y-2">
              {section.blocks.map((block, index) => (
                block.type === 'paragraph' ? (
                  <p key={index}>{block.text}</p>
                ) : (
                  <div key={index}>
                    {block.lead && <p>{block.lead}</p>}
                    <ul className="list-disc space-y-1 pl-5">
                      {block.items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
