// ════════════════════════════════════════════════════════════════════════════
// 어드민 — 메일·콘솔 바로가기 (2026-08-05)
//
// 운영하면서 자주 들어가는 외부 콘솔 링크 모음. 특히 메일이 헷갈려서 만듦:
// creaite.net 수신 메일은 Zoho 이고, admin@ 과 contact@ 는 별칭이 아니라
// ★독립된 사용자 계정★ 이다. 즉 admin@ 으로 로그인한 편지함에는 contact@ 로 온
// 메일이 절대 보이지 않는다(인스타그램 인증메일 등 외부 서비스 가입 확인이 여기로 옴).
// Zoho 자동전달(Email Forwarding)은 유료 플랜 전용이라 무료 플랜인 지금은 못 건다.
//
// ※ 광고사(애드핏·쿠팡·애드센스) 대시보드는 '📢 광고 관리 → 외부 광고'에 있음(중복 배치 안 함).
// ════════════════════════════════════════════════════════════════════════════
import { Mail, Inbox, Copy, ExternalLink, PenSquare, KeyRound } from "lucide-react";
import { toast } from "sonner";

// ── 메일 계정 (Zoho) ──
const ZOHO_MAIL = "https://mail.zoho.com";
const ZOHO_COMPOSE = "https://mail.zoho.com/zm/#compose";
const ZOHO_ADMIN = "https://mailadmin.zoho.com";

interface MailAccount {
  address: string;
  label: string;
  badge: string;
  badgeColor: string;
  desc: string;
}

// ⚠️ 비밀번호는 여기에 적지 않는다. 이 파일은 프론트 번들로 빌드돼 누구나 내려받을 수 있다
//   (`curl .../assets/AdminShortcuts-*.js` 한 줄이면 문자열이 그대로 보인다).
//   계정 비밀번호는 브라우저 비밀번호 관리자에 저장하고, 분실 시 Zoho 관리콘솔에서 재설정한다.
const MAIL_ACCOUNTS: MailAccount[] = [
  {
    address: "admin@creaite.net",
    label: "관리자 계정",
    badge: "주 계정",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    desc: "평소 쓰는 편지함. Zoho 관리자 권한(슈퍼 관리자)이 있어 사용자·별칭·비밀번호를 여기서 관리합니다.",
  },
  {
    address: "support@creaite.net",
    label: "Support Team",
    badge: "★ 공식 문의처 · 정기 확인",
    badgeColor: "bg-red-500/15 text-red-400 border border-red-500/30",
    desc: "푸터·개인정보처리방침·이용약관·고객문의 등 사이트 30곳에 안내된 대외 공식 주소. 고객이 실제로 메일을 보내는 곳인데 독립 계정이라 admin 편지함에는 안 뜹니다. 2026-08-27 확인 시점까지 로그인 이력이 없었으므로 주기적으로 열어볼 것.",
  },
  {
    address: "contact@creaite.net",
    label: "Contact Team",
    badge: "별도 로그인 필요",
    badgeColor: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    desc: "인스타그램 등 외부 서비스 가입에 쓴 주소. 가입 확인·인증 메일이 여기로 옵니다. 독립 계정이라 admin 편지함에는 안 보입니다.",
  },
  {
    address: "business@creaite.net",
    label: "Business Team",
    badge: "별도 로그인 필요",
    badgeColor: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    desc: "제휴·비즈니스 문의용. 비즈니스 안내 페이지에 노출됩니다. 문의가 잦지 않아도 가끔 확인 필요.",
  },
  {
    address: "legal@creaite.net",
    label: "Legal Team",
    badge: "미사용 (안내 없음)",
    badgeColor: "bg-white/5 text-muted-foreground border border-border",
    desc: "계정만 만들어 둔 상태 — 사이트·문서 어디에도 이 주소를 안내하고 있지 않아 외부에서 오는 메일이 없습니다. 권리침해·법무 창구가 필요해지면 그때 안내에 추가하면 됩니다.",
  },
];

// ── 운영 콘솔 ──
interface Console {
  name: string;
  emoji: string;
  url: string;
  desc: string;
}

const CONSOLES: Console[] = [
  {
    name: "Supabase",
    emoji: "🟢",
    url: "https://supabase.com/dashboard/project/tvbpiuwmvrccfnplhwer",
    desc: "DB·SQL 에디터·Edge Functions·인증 로그",
  },
  {
    name: "Bunny Stream",
    emoji: "🐰",
    url: "https://dash.bunny.net/stream/615810",
    desc: "영상 라이브러리 creaite_market(615810) · 인코딩·CDN 설정",
  },
  {
    name: "Vercel",
    emoji: "▲",
    url: "https://vercel.com/dashboard",
    desc: "프론트 배포·환경변수(VITE_*)·도메인",
  },
  {
    name: "Google Play Console",
    emoji: "🤖",
    url: "https://play.google.com/console",
    desc: "앱 출시·테스터 참여 통계·심사 상태",
  },
  {
    name: "토스페이먼츠 상점관리자",
    emoji: "💳",
    url: "https://app.tosspayments.com",
    desc: "가맹 심사 상태·결제 내역·정산 (심사 대기 중)",
  },
];

export function AdminShortcuts() {
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${text} 복사했어요. Zoho 로그인 화면에 붙여넣으세요.`);
    } catch {
      toast.error("복사에 실패했어요. 주소를 직접 입력해 주세요.");
    }
  };

  return (
    <div className="space-y-6">
      {/* ── 안내 ── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
          <Mail className="w-5 h-5 text-[#6366f1]" />
          메일 (Zoho)
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          creaite.net 로 오는 메일은 <b className="text-foreground">Zoho</b> 에서 받습니다.
          아래 5개 주소는 <b className="text-foreground">별칭이 아니라 각각 독립된 계정</b>이라, 한쪽에
          로그인하면 다른 쪽 메일은 보이지 않습니다. 특히{" "}
          <b className="text-red-400">support@ 는 사이트 30곳에 안내된 공식 문의처</b>인데 admin 편지함에
          섞이지 않으니 따로 확인해야 합니다.
          <br />
          <span className="text-xs text-muted-foreground/70">
            ※ 자동 전달(Email Forwarding)로 한 편지함에 합치는 기능은 Zoho <b>유료 플랜 전용</b>이라
            현재(무료 플랜)는 사용할 수 없습니다. IMAP/POP 도 막혀 있어 지메일로 가져올 수도 없습니다 —
            계정을 오가며 확인하거나, 유료 전환 시 전달을 걸어 한 편지함으로 모으면 됩니다.
          </span>
        </p>
      </div>

      {/* ── 메일 계정 카드 ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {MAIL_ACCOUNTS.map((a) => (
          <div key={a.address} className="rounded-xl border border-border bg-card p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Inbox className="w-4 h-4 text-[#6366f1]" />
              <h3 className="font-bold">{a.label}</h3>
            </div>
            <span className={`inline-block w-fit px-2.5 py-1 rounded-full text-[11px] font-bold mb-3 ${a.badgeColor}`}>
              {a.badge}
            </span>
            <p className="text-sm font-mono text-foreground mb-2 break-all">{a.address}</p>
            <p className="text-[11px] text-muted-foreground/70 mb-4 leading-relaxed">{a.desc}</p>
            <div className="mt-auto flex gap-2">
              <a
                href={ZOHO_MAIL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.07] text-sm font-bold transition-colors text-[#6366f1]"
              >
                편지함 열기 <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => void copy(a.address)}
                title="주소 복사"
                className="h-10 px-3 inline-flex items-center justify-center rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.07] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── 메일 보조 링크 ── */}
      <div className="flex flex-wrap gap-2">
        <a
          href={ZOHO_COMPOSE}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.07] text-sm font-bold transition-colors"
        >
          <PenSquare className="w-4 h-4" /> 새 메일 쓰기
        </a>
        <a
          href={ZOHO_ADMIN}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.07] text-sm font-bold transition-colors"
        >
          <KeyRound className="w-4 h-4" /> Zoho 관리콘솔
        </a>
        <span className="text-[11px] text-muted-foreground/70 self-center">
          관리콘솔 → 사용자 → 계정 선택 → 보안에서 비밀번호 재설정 가능
        </span>
      </div>

      {/* ── 운영 콘솔 ── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold mb-1">운영 콘솔</h2>
        <p className="text-sm text-muted-foreground">
          서비스 운영에 자주 들어가는 외부 대시보드입니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {CONSOLES.map((c) => (
          <a
            key={c.name}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-border bg-card p-5 hover:bg-white/[0.03] transition-colors group"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl" aria-hidden="true">{c.emoji}</span>
              <h3 className="font-bold">{c.name}</h3>
              <ExternalLink className="w-3.5 h-3.5 ml-auto text-muted-foreground/50 group-hover:text-[#6366f1] transition-colors" />
            </div>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{c.desc}</p>
          </a>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-5 text-xs text-muted-foreground leading-relaxed">
        <p className="font-bold text-foreground mb-1.5">참고</p>
        <p>· 애드핏·쿠팡·애드센스 대시보드는 <b>📢 광고 관리 → 외부 광고</b> 에 있습니다.</p>
        <p>· 고객 문의 답변은 메일 대신 <b>👥 운영 → 고객 문의</b> 에서 사이트 내 답변(알림 발송)이 기본입니다.</p>
        <p className="mt-1.5">
          · <b className="text-foreground">비밀번호는 이 페이지에 적지 않습니다.</b> 관리자 화면이라도 코드는
          공개 번들로 배포돼 누구나 내려받을 수 있어서, 여기 적으면 사서함이 그대로 열립니다. 브라우저
          비밀번호 관리자에 저장해 두고, 분실하면 위 <b>Zoho 관리콘솔 → 사용자 → 보안</b> 에서 재설정하세요.
        </p>
      </div>
    </div>
  );
}
