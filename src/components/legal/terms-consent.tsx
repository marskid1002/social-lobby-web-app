'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { TERMS_SECTIONS, TERMS_VERSION } from '@/lib/legal';

interface TermsConsentProps {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}

export default function TermsConsent({ accepted, onAcceptedChange }: TermsConsentProps) {
  const [open, setOpen] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function checkReachedEnd() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) setReachedEnd(true);
  }

  useEffect(() => {
    if (!open) return;
    setReachedEnd(false);
    const frame = requestAnimationFrame(checkReachedEnd);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <div className="rounded-xl border border-brand-lavender bg-brand-snow px-3 py-2.5">
        <div className="flex items-start gap-2.5 text-xs leading-relaxed text-brand-ink">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => {
              if (event.target.checked) setOpen(true);
              else onAcceptedChange(false);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-sky"
            aria-describedby="terms-consent-help"
            aria-label="同意平台服務條款暨使用規章"
          />
          <span>
            我已年滿 18 歲，並同意
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                setOpen(true);
              }}
              className="mx-1 font-bold text-brand-sky underline"
            >
              平台服務條款暨使用規章
            </button>
            （v{TERMS_VERSION}）
          </span>
        </div>
        {!accepted && (
          <p id="terms-consent-help" className="mt-1 pl-6 text-[11px] text-zinc-400">
            請閱讀至最下方後完成同意
          </p>
        )}
      </div>

      {open && (
        <div className="app-modal-layer fixed inset-0 flex items-end justify-center bg-black/45 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="terms-dialog-title">
          <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl sm:max-h-[86dvh] sm:rounded-3xl">
            <div className="flex items-start justify-between border-b border-brand-lavender px-5 py-4">
              <div>
                <h2 id="terms-dialog-title" className="font-bold text-brand-ink">平台服務條款暨使用規章</h2>
                <p className="mt-0.5 text-xs text-zinc-400">版本：{TERMS_VERSION}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 min-w-11 rounded-full text-xl text-zinc-400" aria-label="關閉平台規範">
                ×
              </button>
            </div>

            <div ref={scrollRef} onScroll={checkReachedEnd} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 text-sm leading-7 text-brand-ink">
              {TERMS_SECTIONS.map((section) => (
                <section key={section.title} className="mb-6">
                  <h3 className="mb-2 font-bold">{section.title}</h3>
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
              <p className="pb-2 text-center text-xs text-zinc-400">— 條款內容結束 —</p>
            </div>

            <div className="border-t border-brand-lavender bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
              {!reachedEnd && <p className="mb-2 text-center text-xs text-zinc-400">請將內容滑到最下方，即可啟用同意按鈕</p>}
              <button
                type="button"
                disabled={!reachedEnd}
                onClick={() => {
                  onAcceptedChange(true);
                  setOpen(false);
                }}
                className="min-h-11 w-full rounded-xl bg-line-green px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {reachedEnd ? '我已年滿 18 歲，並同意規範' : '閱讀至最下方後可同意'}
              </button>
              <p className="mt-2 text-center text-[11px] text-zinc-400">
                也可前往<Link href="/legal/terms" className="ml-1 underline">完整條款頁</Link>查看
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
