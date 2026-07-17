// ════════════════════════════════════════════════════════════════════════════
// 외부 광고 — 수익 대시보드 바로가기 + 실시간 노출상태 (2026-07-02, 상태 자동화 2026-07-17)
//
// 각 광고사(애드핏/쿠팡/애드센스) 수익·통계는 각 사 대시보드에서만 조회 가능
// (애드핏은 퍼블리셔용 리포트 API 미제공 → 자동 통합 불가). 여기선 바로가기 + 현재 상태 제공.
//
// ★ 노출상태 배지는 하드코딩이 아니라, 실제 서빙 컴포넌트(ExternalAdSlot/CoupangBanner)가
//   읽는 것과 동일한 빌드타임 env 를 그대로 반영한다. 광고가 꺼지면(스위치 OFF·ID 미설정)
//   관리자 화면도 자동으로 '대기'로 바뀌어 거짓 '노출 중' 표기를 방지한다.
// ════════════════════════════════════════════════════════════════════════════
import { ExternalLink, AlertTriangle } from "lucide-react";
import {
  EXTERNAL_ADS_MASTER_ON,
  ADFIT_ACTIVE,
  ADSENSE_ACTIVE,
  ADSENSE_CONFIGURED,
  ADSENSE_CLIENT_ID,
} from "./ExternalAdSlot";
import { COUPANG_ACTIVE } from "./CoupangBanner";

// index.html 의 AdSense 로더에 고정된 게시자 ID(사이트 소유확인용). env(VITE_ADSENSE_CLIENT)
// 미설정 시 이 값을 표시 폴백으로 사용한다.
const VERIFY_PUB_ID = "ca-pub-1525031148019194";

type Status = { label: string; color: string };
const GREEN = "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
const BLUE = "bg-blue-500/15 text-blue-400 border border-blue-500/30";
const AMBER = "bg-amber-500/15 text-amber-400 border border-amber-500/30";
const GRAY = "bg-white/[0.04] text-muted-foreground border border-white/10";

// 실제 서빙 설정(env) 기준 상태 판정 — 문자열 상수가 아니라 진짜 노출 여부.
const adfitStatus: Status = ADFIT_ACTIVE
  ? { label: "노출 중", color: GREEN }
  : EXTERNAL_ADS_MASTER_ON
    ? { label: "광고단위 미설정", color: AMBER }
    : { label: "대기 (비활성)", color: GRAY };

// 쿠팡은 CoupangBanner 가 하드코딩 기본 위젯ID(env 미설정 시 폴백)로 상시 COUPANG_ACTIVE=true →
// Footer 에서 항상 노출되므로 실제로 '노출 중'이 맞다. (파트너십 종료 시 서빙 컴포넌트 변경 필요 —
// 그때 이 GRAY '미설정' 분기가 살아남. 지금은 방어용.)
const coupangStatus: Status = COUPANG_ACTIVE
  ? { label: "노출 중", color: GREEN }
  : { label: "미설정", color: GRAY };

// 애드센스도 애드핏과 대칭 — 마스터 스위치가 블로커면 '슬롯/심사 대기'(구글 대기)로 오인시키지 말 것.
const adsenseStatus: Status = ADSENSE_ACTIVE
  ? { label: "노출 중", color: GREEN }
  : !EXTERNAL_ADS_MASTER_ON
    ? { label: "대기 (비활성)", color: GRAY } // 스위치 OFF 가 실제 블로커(게시자ID·슬롯 유무 무관)
    : ADSENSE_CONFIGURED
      ? { label: "슬롯/심사 대기", color: BLUE } // 스위치 ON + 게시자ID 있음, 슬롯 미설정/심사중
      : { label: "미설정 (심사 전)", color: GRAY };

// 애드센스 게시자 ID 드리프트 — env(VITE_ADSENSE_CLIENT)가 index.html 로더/ads.txt 인증 게시자와
// 다르면 배지는 '노출 중'이라도 구글이 ads.txt 불일치로 서빙을 차단(=거짓 초록). 불일치 시에만 경고.
const adsenseDrift = !!ADSENSE_CLIENT_ID && ADSENSE_CLIENT_ID !== VERIFY_PUB_ID;

interface AdNet {
  name: string;
  desc: string;
  url: string;
  reportHint: string;
  status: Status;
  accent: string; // 아이콘/링크 색
  emoji: string;
}

const NETWORKS: AdNet[] = [
  {
    name: "카카오 애드핏",
    desc: "홈피드·커뮤니티·검색·영상상세 디스플레이 광고 (CPM)",
    url: "https://adfit.kakao.com/",
    reportHint: "로그인 후 좌측 '보고서'에서 노출수·클릭·예상수익 확인",
    status: adfitStatus,
    accent: "text-[#ffcd00]",
    emoji: "🟡",
  },
  {
    name: "쿠팡 파트너스",
    desc: "푸터 다이나믹 배너 (클릭→구매 시 수수료)",
    url: "https://partners.coupang.com/",
    reportHint: "로그인 후 '리포트'에서 클릭·구매·수익 확인 (실시간 집계 중)",
    status: coupangStatus,
    accent: "text-[#ff5a5f]",
    emoji: "🛒",
  },
  {
    name: "구글 애드센스",
    desc: `애드핏과 번갈아 노출 (CPM) — 게시자 ${ADSENSE_CLIENT_ID || VERIFY_PUB_ID}`,
    url: "https://adsense.google.com/",
    reportHint: "승인 후 '보고서'에서 수익 확인. 승인되면 광고단위 슬롯ID 연결 필요",
    status: adsenseStatus,
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
          <br />
          <span className="text-xs text-muted-foreground/70">
            ※ 아래 <b>노출 상태 배지</b>는 실제 서비스 광고 설정(환경변수)을 자동 반영합니다.
          </span>
        </p>
      </div>

      {/* 마스터 스위치가 꺼져 있으면(=애드핏·애드센스 미노출) 경고 배너로 명시 —
          관리자가 '노출 중'으로 오인하지 않도록. (쿠팡 배너는 스위치와 무관하게 상시 노출) */}
      {!EXTERNAL_ADS_MASTER_ON && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-amber-200/90 leading-relaxed">
            <b className="text-amber-300">외부 광고 마스터 스위치가 꺼져 있습니다.</b> 애드핏·애드센스는 현재
            노출되지 않습니다. 승인 후 Vercel 환경변수{" "}
            <code className="text-amber-300">VITE_EXTERNAL_ADS_ENABLED=1</code> 을 설정하고 재배포하세요.
            <span className="text-amber-200/60"> (쿠팡 파트너스 배너는 이 스위치와 무관하게 노출됩니다.)</span>
          </div>
        </div>
      )}

      {/* 애드센스 게시자 ID 불일치 — env 가 index.html 로더/ads.txt 인증 게시자와 다르면
          '노출 중'으로 보여도 구글이 실제 서빙을 차단(false green). 불일치 시에만 노출. */}
      {adsenseDrift && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-amber-200/90 leading-relaxed">
            <b className="text-amber-300">애드센스 게시자 ID 불일치.</b> 환경변수{" "}
            <code className="text-amber-300">VITE_ADSENSE_CLIENT</code>(<code className="text-amber-300">{ADSENSE_CLIENT_ID}</code>)
            가 index.html 로더·<code className="text-amber-300">public/ads.txt</code> 인증 게시자
            (<code className="text-amber-300">{VERIFY_PUB_ID}</code>)와 다릅니다. 세 곳을 같은 게시자로 맞춰야
            광고가 노출됩니다 (불일치 시 구글이 서빙 차단).
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {NETWORKS.map((n) => (
          <div key={n.name} className="rounded-xl border border-border bg-card p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl" aria-hidden="true">{n.emoji}</span>
              <h3 className="font-bold">{n.name}</h3>
            </div>
            <span className={`inline-block w-fit px-2.5 py-1 rounded-full text-[11px] font-bold mb-3 ${n.status.color}`}>
              {n.status.label}
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
        <p>· <b>쿠팡 파트너스</b>: 리포트 → 클릭·구매·수익 (실시간 집계 중, 클릭 발생 확인됨).</p>
        <p>· <b>애드센스</b>: 승인 후 보고서에서 수익. 승인 시 광고단위 슬롯ID를 개발에 전달하면 노출 시작.</p>
      </div>
    </div>
  );
}
