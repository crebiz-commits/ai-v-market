// ════════════════════════════════════════════════════════════════════════════
// ExternalAdSlot — 네트워크 무관 외부 광고 슬롯 (카카오 애드핏 + Google AdSense, 확장 가능)
//
// 홈피드의 자체광고가 없을 때 그 자리(영상 4개마다)에 외부 광고 네트워크를 노출.
// 여러 네트워크를 index 기준 "로테이션"으로 돌린다(슬롯마다 번갈아).
//
// 규격: 300×250(미디엄 렉탱글) 고정 — 슬롯 중앙에 카드로 배치, 나머지는 브랜드 배경으로 마감.
//   (광고 네트워크는 표준 고정 규격으로 내려주므로 임의 확대/축소 불가 — AdSense는 정책 위반)
//
// 안전장치:
//   - VITE_EXTERNAL_ADS_ENABLED 가 켜져 있고, 해당 네트워크 ID(env)가 있어야만 실제 노출.
//   - 미설정/비활성 시 운영에선 null, 개발에선 300×250 자리표시.
//
// 환경변수(.env):
//   VITE_EXTERNAL_ADS_ENABLED=1
//   VITE_ADFIT_UNIT_ID=DAN-xxxxxxxx        # 애드핏 300×250 광고단위
//   VITE_ADFIT_WIDTH=300  VITE_ADFIT_HEIGHT=250
//   VITE_ADSENSE_CLIENT=ca-pub-xxxxxxxxxxxxxxxx   # AdSense 게시자 ID
//   VITE_ADSENSE_SLOT=xxxxxxxxxx                   # AdSense 300×250 고정 광고 슬롯
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";

const ENV: any = (import.meta as any).env ?? {};
const _flag = String(ENV.VITE_EXTERNAL_ADS_ENABLED ?? "").toLowerCase();
const EXTERNAL_ADS_ON = _flag === "1" || _flag === "true";

// 광고 카드 규격 (미디엄 렉탱글 300×250)
const AD_W = Number(ENV.VITE_ADFIT_WIDTH ?? 300);
const AD_H = Number(ENV.VITE_ADFIT_HEIGHT ?? 250);

const ADFIT = {
  unit: (ENV.VITE_ADFIT_UNIT_ID as string | undefined) || undefined,
};
const ADSENSE = {
  client: (ENV.VITE_ADSENSE_CLIENT as string | undefined) || undefined, // ca-pub-...
  slot: (ENV.VITE_ADSENSE_SLOT as string | undefined) || undefined,
};

// 외부 광고가 실제로 활성(스위치 ON + 최소 한 네트워크 ID 존재)인지 —
// 피드가 "빈 광고 슬롯"을 만들지 판단하는 가드용. (비활성이면 슬롯 자체를 넣지 않아 빈 칸 방지)
export const EXTERNAL_ADS_ACTIVE =
  EXTERNAL_ADS_ON && (!!ADFIT.unit || (!!ADSENSE.client && !!ADSENSE.slot));

type Network = "adfit" | "adsense";

// env 에 ID 가 채워진 네트워크만 활성 목록에 포함
function enabledNetworks(): Network[] {
  const list: Network[] = [];
  if (ADFIT.unit) list.push("adfit");
  if (ADSENSE.client && ADSENSE.slot) list.push("adsense");
  return list;
}

// 외부 스크립트 1회만 로드 (중복 삽입 방지)
const _loaded = new Set<string>();
function loadScriptOnce(src: string) {
  if (_loaded.has(src)) return;
  _loaded.add(src);
  const s = document.createElement("script");
  s.src = src;
  s.async = true;
  s.crossOrigin = "anonymous";
  document.head.appendChild(s);
}

interface ExternalAdSlotProps {
  /** 피드 내 슬롯 순번 — 네트워크 로테이션 기준(슬롯마다 번갈아 노출) */
  index?: number;
  className?: string;
}

export function ExternalAdSlot({ index = 0, className = "" }: ExternalAdSlotProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const networks = enabledNetworks();
  const network: Network | null = networks.length ? networks[index % networks.length] : null;
  const [visible, setVisible] = useState(false);

  // 지연 로드: 슬롯이 뷰포트 근처에 올 때만 광고 초기화.
  // (무한 피드의 모든 광고 슬롯이 마운트 즉시 동시에 ba.min.js 로드+광고호출 →
  //  첫 화면 멈춤·과부하를 유발하던 문제 방지. 화면 밖 슬롯은 빈 div로만 대기.)
  useEffect(() => {
    if (!EXTERNAL_ADS_ON || !network) return;
    const el = wrapperRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) { setVisible(true); io.disconnect(); }
      },
      { rootMargin: "300px" },  // 화면 도달 직전 미리 로드
    );
    io.observe(el);
    return () => io.disconnect();
  }, [network]);

  useEffect(() => {
    if (!visible || !network || !containerRef.current) return;
    const el = containerRef.current;
    el.innerHTML = "";

    if (network === "adfit" && ADFIT.unit) {
      // 카카오 애드핏: ins 삽입 후 로더 스크립트가 스캔하여 렌더 (300×250 고정)
      const ins = document.createElement("ins");
      ins.className = "kakao_ad_area";
      ins.style.display = "none";
      ins.setAttribute("data-ad-unit", ADFIT.unit);
      ins.setAttribute("data-ad-width", String(AD_W));
      ins.setAttribute("data-ad-height", String(AD_H));
      el.appendChild(ins);
      const s = document.createElement("script");
      s.async = true;
      s.src = "//t1.daumcdn.net/kas/static/ba.min.js";
      el.appendChild(s);
    } else if (network === "adsense" && ADSENSE.client && ADSENSE.slot) {
      // Google AdSense: 300×250 고정 디스플레이 유닛
      loadScriptOnce(
        `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE.client}`,
      );
      const ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.display = "inline-block";
      ins.style.width = `${AD_W}px`;
      ins.style.height = `${AD_H}px`;
      ins.setAttribute("data-ad-client", ADSENSE.client);
      ins.setAttribute("data-ad-slot", ADSENSE.slot);
      el.appendChild(ins);
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch {
        /* 로더 아직 미도착 시 무시 — 스크립트 로드 후 자동 렌더 */
      }
    }

    return () => {
      el.innerHTML = "";
    };
  }, [visible, network]);

  // 미설정/비활성 — 운영·개발 모두 렌더 안 함(빈 슬롯). ID(env) 등록 시에만 실제 광고 노출.
  if (!EXTERNAL_ADS_ON || !network) {
    return null;
  }

  return (
    <div
      ref={wrapperRef}
      className={`relative flex items-center justify-center bg-[#0a0a0a] overflow-hidden ${className}`}
    >
      {/* 광고 라벨 (정책상 광고 명시 필수) */}
      <div className="absolute top-3 left-3 z-10 px-2 py-0.5 bg-black/50 backdrop-blur-sm border border-white/20 rounded-full text-[10px] font-bold text-white/70 tracking-widest">
        AD
      </div>
      {/* 300×250 광고 카드 (중앙 배치) */}
      <div
        className="rounded-xl overflow-hidden bg-black/30 border border-white/10 shadow-lg flex items-center justify-center"
        style={{ width: AD_W, height: AD_H }}
      >
        <div ref={containerRef} className="flex items-center justify-center" />
      </div>
    </div>
  );
}
