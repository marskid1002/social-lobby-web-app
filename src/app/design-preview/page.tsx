import Image from 'next/image';
import {
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Heart,
  Home,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Send,
  Sparkles,
  UserRound,
  Users,
  Wine,
  X,
} from 'lucide-react';
import styles from './preview.module.css';

const swatches = [
  { name: 'Night', value: '#070812' },
  { name: 'Surface', value: '#121421' },
  { name: 'Orange', value: '#FF7A3D' },
  { name: 'Pink', value: '#FF3C91' },
  { name: 'Violet', value: '#6C2EFF' },
];

function Avatar({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={styles.avatar} style={{ background: tone }} aria-label={label}>
      {label.slice(0, 1)}
    </span>
  );
}

export default function DesignPreviewPage() {
  return (
    <main className={styles.preview}>
      <div className={styles.ambientOne} />
      <div className={styles.ambientTwo} />

      <header className={styles.header}>
        <div className={styles.brandLockup}>
          <Image
            src="/icons/icon-192.png"
            width={46}
            height={46}
            alt="JUGA"
            className={styles.logo}
            priority
          />
          <div>
            <p className={styles.brand}>JUGA</p>
            <p className={styles.brandCaption}>Start a Good Gathering</p>
          </div>
        </div>
        <span className={styles.previewBadge}>視覺預覽</span>
      </header>

      <section className={styles.hero}>
        <span className={styles.eyebrow}><Sparkles size={13} /> NIGHT SOCIAL SYSTEM</span>
        <h1>今晚的相遇，<br /><span>從這裡開始。</span></h1>
        <p>以 JUGA 圖示為核心，延伸出深色、精緻而有溫度的夜生活介面。</p>
        <div className={styles.heroActions}>
          <button className={styles.primaryButton}><Plus size={18} /> 發起約會</button>
          <button className={styles.iconButton} aria-label="通知"><Bell size={19} /></button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>01</span>
            <h2>品牌色彩</h2>
          </div>
          <p>深夜底色 × 暖色漸層</p>
        </div>
        <div className={styles.swatches}>
          {swatches.map((swatch) => (
            <div key={swatch.name} className={styles.swatch}>
              <span style={{ background: swatch.value }} />
              <small>{swatch.name}</small>
              <code>{swatch.value}</code>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>02</span>
            <h2>搜尋與狀態</h2>
          </div>
          <p>重要資訊一眼辨識</p>
        </div>

        <div className={styles.searchBox}>
          <Search size={17} />
          <span>搜尋約會、地區或使用者…</span>
          <kbd>⌘ K</kbd>
        </div>

        <div className={styles.chips}>
          <span className={styles.activeChip}>全部</span>
          <span><Wine size={13} /> 喝一杯</span>
          <span>After Party</span>
          <span>臨時約會</span>
        </div>

        <div className={styles.statusRow}>
          <span><i className={styles.available} />可安排</span>
          <span><i className={styles.waiting} />等待確認</span>
          <span><i className={styles.busy} />忙碌中</span>
          <span><i className={styles.closed} />已結束</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>03</span>
            <h2>約會卡片</h2>
          </div>
          <p>保留現有資訊與操作</p>
        </div>

        <article className={styles.eventCard}>
          <div className={styles.eventGlow} />
          <div className={styles.eventTop}>
            <div className={styles.hostLine}>
              <Avatar label="Q" tone="linear-gradient(145deg,#ffad66,#ff3c91)" />
              <div>
                <strong>Queen 發起的約會</strong>
                <span><Clock3 size={12} /> 12 分鐘前</span>
              </div>
            </div>
            <span className={styles.typeBadge}>喝一杯</span>
          </div>

          <h3>今晚 10:00 松山小酌</h3>
          <p className={styles.eventMeta}><MapPin size={15} /> 松山區 · 3 人 · 約 2 小時</p>

          <div className={styles.capacity}>
            <div>
              <span className={styles.heartFilled}><Heart size={21} fill="currentColor" /></span>
              <span className={styles.heartFilled}><Heart size={21} fill="currentColor" /></span>
              <span className={styles.heartEmpty}><Heart size={21} /></span>
            </div>
            <strong>已確認 2/3</strong>
          </div>

          <div className={styles.eventFooter}>
            <div className={styles.avatarStack}>
              <Avatar label="妍" tone="linear-gradient(145deg,#6545ed,#ae4cff)" />
              <Avatar label="美" tone="linear-gradient(145deg,#ff6b8a,#ff9f43)" />
              <span className={styles.avatarMore}>+1</span>
            </div>
            <button className={styles.secondaryButton}>查看詳情 <ChevronRight size={16} /></button>
          </div>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>04</span>
            <h2>按鈕與表單</h2>
          </div>
          <p>所有狀態使用同一規格</p>
        </div>
        <div className={styles.buttonGrid}>
          <button className={styles.primaryButton}>主要操作</button>
          <button className={styles.secondaryButton}>次要操作</button>
          <button className={styles.successButton}><Check size={16} /> 確認出席</button>
          <button className={styles.dangerButton}><X size={16} /> 約會未成立</button>
          <button className={styles.disabledButton} disabled>目前不可操作</button>
        </div>
        <label className={styles.inputGroup}>
          <span>備註</span>
          <div>想找個好聊的人一起小酌…</div>
          <small>0 / 200</small>
        </label>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>05</span>
            <h2>通知與聊天</h2>
          </div>
          <p>柔和，但足夠醒目</p>
        </div>

        <div className={styles.notification}>
          <span className={styles.notificationIcon}><Bell size={18} /></span>
          <div>
            <strong>有人想參加你的約會</strong>
            <p>有人對你的約會感興趣，快去看看</p>
          </div>
          <span className={styles.unreadDot} />
        </div>

        <div className={styles.chatCard}>
          <div className={styles.chatHeader}>
            <Avatar label="妍" tone="linear-gradient(145deg,#6545ed,#ff3c91)" />
            <div><strong>妍妍</strong><span><i className={styles.available} /> 線上</span></div>
            <span className={styles.chatTimer}>還有 1 天</span>
          </div>
          <div className={styles.messages}>
            <div className={styles.receivedBubble}>嗨～今晚的時間沒問題 😊</div>
            <div className={styles.sentBubble}>太好了，晚點聊天室見！</div>
          </div>
          <div className={styles.composer}>
            <Plus size={18} />
            <span>輸入訊息…</span>
            <button aria-label="傳送"><Send size={16} /></button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>06</span>
            <h2>底部彈窗</h2>
          </div>
          <p>安全區與操作按鈕保留</p>
        </div>
        <div className={styles.sheetDemo}>
          <div className={styles.sheetHandle} />
          <span className={styles.sheetKicker}>安排出席</span>
          <h3>選擇今晚出席的女伴</h3>
          <p>已選擇 1 位，可超額安排</p>
          <div className={styles.personOption}>
            <Avatar label="真" tone="linear-gradient(145deg,#4532c8,#e23f91)" />
            <div><strong>真真</strong><span><i className={styles.available} /> 可安排</span></div>
            <span className={styles.checkCircle}><Check size={16} /></span>
          </div>
          <div className={`${styles.personOption} ${styles.personDisabled}`}>
            <Avatar label="美" tone="linear-gradient(145deg,#303442,#555a68)" />
            <div><strong>美麗</strong><span><i className={styles.busy} /> 忙碌中</span></div>
            <span className={styles.lockedLabel}>不可選</span>
          </div>
          <button className={`${styles.primaryButton} ${styles.fullButton}`}>
            確認安排（1 位）
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>07</span>
            <h2>底部導覽</h2>
          </div>
          <p>固定、安全、清楚</p>
        </div>
        <nav className={styles.bottomNav} aria-label="設計預覽導覽">
          <span className={styles.navActive}><Home size={20} /><small>首頁</small></span>
          <span><Search size={20} /><small>探索</small></span>
          <span className={styles.navFab}><Plus size={24} /></span>
          <span><MessageCircle size={20} /><small>聊天</small><b>3</b></span>
          <span><UserRound size={20} /><small>我的</small></span>
        </nav>
      </section>

      <footer className={styles.footer}>
        <Image src="/icons/icon-192.png" width={34} height={34} alt="" />
        <div><strong>JUGA Visual System</strong><span>Concept 01 · Night Gathering</span></div>
        <Users size={18} />
      </footer>
    </main>
  );
}
