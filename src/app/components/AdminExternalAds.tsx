// ════════════════════════════════════════════════════════════════════════════
// 외부 광고 — 수익 대시보드 바로가기 (2026-07-02)
//
// 각 광고사(애드핏/쿠팡/애드센스) 수익·통계는 각 사 대시보드에서만 조회 가능
// (애드핏은 퍼블리셔용 리포트 API 미제공 → 자동 통합 불가). 여기선 바로가기 + 현재 상태 제공.
// ════════════════════════════════════════════════════════════════════════════
import { ExternalLink } from "lucide-react";

interface AdNet {
  name: string;
  desc: string;
  url: string;
  reportHint: string;
  status: string;
  statusColor: string;
  accent: string;   // 아이콘/링크 색
  emoji: string;
}

const NETWORKS: AdNet[] = [
  {
    name: "카카오 애드핏",
    desc: "홈피드·커뮤니티·검색·영상상세 디스플레이 광고 (CPM)",
    url: "https://adfit.kakao.com/",
    reportHint: "로그인 후 좌측 '보고서'에서 노출수·클릭·예상수익 확인",
    status: "노출 중",
    statusColor: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    accent: "text-[#ffcd00]",
    emoji: "🟡",
  },
  {
    name: "쿠팡 파트너스",
    desc: "푸터 다이나믹 배너 (클릭→구매 시 수수료)",
    url: "https://partners.coupang.com/",
    reportHint: "로그인 후 '리포트'에서 클릭·구매·수익 확인 (스크린샷 최종승인 대기)",
    status: "노출 중 · 최종승인 대기",
    statusColor: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    accent: "text-[#ff5a5f]",
    emoji: "🛒",
  },
  {
    name: "구글 애드센스",
    desc: "애드핏과 번갈아 노출 예정 (CPM) — 게시자 ca-pub-1525031148019194",
    url: "https://adsense.google.com/",
    reportHint: "승인 후 '보고서'에서 수익 확인. 승인되면 광고단위 슬롯ID 연결 필요",
    status: "구글 심사 중",
    statusColor: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    accent: "text-blue-400",
    emoji: "🔵",
  },
];

export function AdminExternalAds() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold mb-1">외부 광고 수익 · 바로가기</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          각 광고사의 수익·통계는 해당 사이트 대시보드에서 조회합니다. 아래 버튼으로 바로 이동하세요.
          <br />
          <span className="text-xs text-muted-foreground/70">
            ※ 애드핏은 퍼블리셔용 수익 API를 제공하지 않아 관리자 자동 통합은 불가합니다 (대시보드 조회만 가능).
          </span>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {NETWORKS.map((n) => (
          <div key={n.name} className="rounded-xl border border-border bg-card p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{n.emoji}</span>
              <h3 className="font-bold">{n.name}</h3>
            </div>
            <span className={`inline-block w-fit px-2.5 py-1 rounded-full text-[11px] font-bold mb-3 ${n.statusColor}`}>
              {n.status}
            </span>
            <p className="text-sm text-muted-foreground mb-2">{n.desc}</p>
            <p className="text-[11px] text-muted-foreground/70 mb-4 leading-relaxed">{n.reportHint}</p>
            <a
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-auto inline-flex items-center justify-center gap-1.5 h-10 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.07] text-sm font-bold transition-colors ${n.accent}`}
            >
              대시보드 열기 <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-5 text-xs text-muted-foreground leading-relaxed">
        <p className="font-bold text-foreground mb-1.5">참고</p>
        <p>· <b>애드핏</b>: 대시보드 → 보고서 (매체·광고단위별 노출·클릭·예상적립금). 지급은 월 단위.</p>
        <p>· <b>쿠팡 파트너스</b>: 리포트 → 클릭·구매·수익. 스크린샷 최종승인 후 정식 집계.</p>
        <p>· <b>애드센스</b>: 승인 후 보고서에서 수익. 승인 시 광고단위 슬롯ID를 개발에 전달하면 노출 시작.</p>
      </div>
    </div>
  );
}
