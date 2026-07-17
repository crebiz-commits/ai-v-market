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
import { useEffect, useRef, useCallback } from "react";

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

// ── 관리자 '외부 광고' 상태판용 파생 플래그 ─────────────────────────────────────
//   하드코딩 문자열이 아니라, 실제 서빙 컴포넌트가 읽는 것과 "동일한" 빌드타임 env 를
//   그대로 반영 → 광고가 꺼지면 관리자 화면도 자동으로 '대기'로 바뀜(거짓 '노출 중' 방지).
export const EXTERNAL_ADS_MASTER_ON = EXTERNAL_ADS_ON;               // VITE_EXTERNAL_ADS_ENABLED
export const ADFIT_ACTIVE = EXTERNAL_ADS_ON && !!ADFIT.unit;         // 스위치 ON + 광고단위 ID
export const ADSENSE_ACTIVE = EXTERNAL_ADS_ON && !!ADSENSE.client && !!ADSENSE.slot;
export const ADSENSE_CONFIGURED = !!ADSENSE.client;                 // 게시자 ID 존재(슬롯/심사 대기 가능)
export const ADSENSE_CLIENT_ID = ADSENSE.client;                    // ca-pub-... (표시용)

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
  /** 특정 네트워크 강제(라운드로빈 순환용). 해당 네트워크가 활성일 때만 적용, 아니면 index 로테이션. */
  forceNetwork?: Network;
}

export function ExternalAdSlot({ index = 0, className = "", forceNetwork }: ExternalAdSlotProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const networks = enabledNetworks();
  const network: Network | null =
    forceNetwork && networks.includes(forceNetwork)
      ? forceNetwork
      : networks.length
        ? networks[index % networks.length]
        : null;
  // 광고 삽입 (애드핏: ins+로더 / 애드센스: ins+push). 비어 있을 때만 호출.
  const injectAd = useCallback(() => {
    const el = containerRef.current;
    if (!el || !network) return;
    el.innerHTML = "";

    if (network === "adfit" && ADFIT.unit) {
      // 카카오 애드핏: 격리 iframe(/adfit.html)에서 ba.min.js 를 매번 새로 로드 → 동적/지연
      //   추가 슬롯(반응형 전환·리사이즈)도 항상 렌더. (부모에 ins 직접삽입은 ba.min.js 1회
      //   스캔 한계로 새로고침해야만 보이던 빈칸 발생). 같은 도메인 파일이라 도메인 인증 정상.
      const iframe = document.createElement("iframe");
      iframe.src = `/adfit.html?unit=${encodeURIComponent(ADFIT.unit)}&w=${AD_W}&h=${AD_H}`;
      iframe.width = String(AD_W);
      iframe.height = String(AD_H);
      iframe.title = "advertisement";
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("frameborder", "0");
      iframe.style.cssText = `width:${AD_W}px;height:${AD_H}px;border:0;overflow:hidden;display:block;`;
      el.appendChild(iframe);
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
  }, [network]);

  // 지연 로드 + 리사이즈 복원 (단일 로직):
  //   - 슬롯이 화면 근처이고 "비어 있을 때만"(ins·iframe 둘 다 없음) 광고 삽입.
  //   - IntersectionObserver 는 끊지 않고 유지 → 보였다/안 보였다 해도 빈 슬롯이면 다시 채움.
  //   - 리사이즈/반응형(모바일↔데스크탑) 전환으로 광고가 사라지면 디바운스 후 재삽입.
  //   ※ "ins·iframe 모두 없을 때만" 채우므로, 로딩 중인 광고를 끊거나(=풀사이즈 빈칸 버그) 중복 호출하지 않음.
  useEffect(() => {
    if (!EXTERNAL_ADS_ON || !network) return;
    const wrap = wrapperRef.current;
    if (!wrap) return;

    const fillIfEmpty = () => {
      const el = containerRef.current;
      if (el && !el.querySelector("ins, iframe")) injectAd();
    };

    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) fillIfEmpty(); },
      { rootMargin: "300px" },  // 화면 도달 직전 미리 로드
    );
    io.observe(wrap);

    let t = 0;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const r = wrap.getBoundingClientRect();
        const near = r.bottom > -300 && r.top < window.innerHeight + 300;
        if (near) fillIfEmpty();
      }, 450);
    };
    window.addEventListener("resize", onResize);

    return () => {
      io.disconnect();
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
    };
  }, [network, injectAd]);

  // 미설정/비활성 — 운영·개발 모두 렌더 안 함(빈 슬롯). ID(env) 등록 시에만 실제 광고 노출.
  if (!EXTERNAL_ADS_ON || !network) {
    return null;
  }

  return (
    <div
      ref={wrapperRef}
      className={`relative flex items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#3d2e86_0%,#171022_50%,#3a1a52_100%)] ${className}`}
    >
      {/* 배경(여백)만 브랜드 오로라 그라데이션 — 광고가 작아 생기는 빈 공간을 채움.
          ※ AdFit 정책상 광고 자체는 변형·강조·라운딩·가림 금지 → 아래 광고 컨테이너는 손대지 않음(원본 그대로). */}
      <div ref={containerRef} className="relative flex items-center justify-center" style={{ width: AD_W, height: AD_H }} />
    </div>
  );
}
