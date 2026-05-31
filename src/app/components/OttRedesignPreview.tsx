import { useEffect, useRef } from "react";
import { Play, Info, Plus } from "lucide-react";

// ════════════════════════════════════════════════════════════════════════════
// ?preview=ott-redesign — OTT 재설계 미리보기 (라이브 미적용)
//  - 상단 히어로: 데스크탑 3분할 / 모바일 1개씩 + 5초 자동 슬라이드(3개)
//  - 하단: 카테고리 행. 한 줄은 우측, 다음 줄은 좌측으로 천천히 자동 흐름(마퀴).
//          가로형(16:9) 카드. 마우스 올리면 정지. (쿠팡플레이 하단 스타일)
// ════════════════════════════════════════════════════════════════════════════

const img = (seed: string) => `https://picsum.photos/seed/${seed}/640/360`;

interface Hero { id: string; title: string; subtitle: string; tag: string; image: string; }
const HEROES: Hero[] = [
  { id: "h1", title: "미래 전쟁과 로봇의 시대", subtitle: "AI가 그린 디스토피아 블록버스터", tag: "CREAITE 오리지널", image: img("ott-hero-1") },
  { id: "h2", title: "윤아의 모험", subtitle: "환상의 세계로 떠나는 AI 애니메이션", tag: "이번 주 1위", image: img("ott-hero-2") },
  { id: "h3", title: "미쥬라 연대기", subtitle: "설원을 가로지르는 대서사시", tag: "신규 공개", image: img("ott-hero-3") },
];

interface Cat { title: string; dir: "left" | "right"; items: { id: string; title: string; image: string }[]; }
const mkItems = (prefix: string, names: string[]) =>
  names.map((n, i) => ({ id: `${prefix}-${i}`, title: n, image: img(`${prefix}-${i}`) }));

const CATS: Cat[] = [
  { title: "지금 뜨는 액션", dir: "right", items: mkItems("act", ["탑건 매버릭", "트위스티드 메탈", "할로", "불릿트레인", "미래 전쟁", "검은 태양", "라스트 미션", "오버드라이브"]) },
  { title: "감성 드라마", dir: "left", items: mkItems("drama", ["경여년2", "언내추럴", "999 형사", "더 라스트 오브 어스", "일념관산", "윤아의 모험", "봄의 기억", "푸른 밤"]) },
  { title: "다큐멘터리", dir: "right", items: mkItems("doc", ["지구의 끝", "심해 탐사", "우주의 시작", "AI 혁명", "도시의 밤", "자연의 소리", "인류의 미래", "빙하기"]) },
  { title: "AI 애니메이션", dir: "left", items: mkItems("ani", ["미쥬라 연대기", "별빛 소녀", "로봇 친구", "마법 학교", "구름 위 마을", "용의 전설", "픽셀 히어로", "달빛 여행"]) },
];

function HeroPanels() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const t = setInterval(() => {
      if (el.scrollWidth <= el.clientWidth + 4) return;
      let next = el.scrollLeft + el.clientWidth;
      if (next >= el.scrollWidth - 4) next = 0;
      el.scrollTo({ left: next, behavior: "smooth" });
    }, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div ref={ref} className="flex overflow-x-auto scrollbar-hide snap-x snap-mandatory">
      {HEROES.map((h) => (
        <div key={h.id} className="snap-start flex-shrink-0 w-full md:w-1/3 p-1.5">
          <button className="relative block w-full h-[52vh] md:h-[60vh] rounded-2xl overflow-hidden text-left group">
            <img src={h.image} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6">
              <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold text-white bg-gradient-to-r from-[#a78bfa] via-[#ec4899] to-[#f59e0b] mb-2">{h.tag}</span>
              <h2 className="text-2xl md:text-3xl font-black text-white leading-tight mb-1">{h.title}</h2>
              <p className="text-xs md:text-sm text-gray-300 mb-3 line-clamp-2">{h.subtitle}</p>
              <div className="flex gap-2">
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black text-xs font-bold"><Play className="w-4 h-4 fill-black" /> 재생</span>
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/15 backdrop-blur border border-white/30 text-white text-xs font-bold"><Info className="w-4 h-4" /> 정보</span>
              </div>
            </div>
          </button>
        </div>
      ))}
    </div>
  );
}

function MarqueeRow({ cat }: { cat: Cat }) {
  // 끊김 없는 무한 흐름: 항목 2벌 복제, 트랙을 -50%까지 이동
  const doubled = [...cat.items, ...cat.items];
  const duration = `${cat.items.length * 20}s`; // 더 천천히
  return (
    <section className="mb-7">
      <h3 className="text-base md:text-lg font-bold px-4 md:px-6 mb-2.5">{cat.title}</h3>
      <div className="marquee-row overflow-hidden">
        <div
          className={`flex gap-3 w-max ${cat.dir === "right" ? "marquee-right" : "marquee-left"}`}
          style={{ animationDuration: duration }}
        >
          {doubled.map((it, i) => (
            <button key={i} className="flex-shrink-0 w-72 md:w-[26rem] group/card text-left">
              <div className="relative aspect-video rounded-xl overflow-hidden bg-card">
                <img src={it.image} alt="" className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500" />
                {/* 제목·정보를 카드 안(하단 그라데이션)에 */}
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/45 to-transparent">
                  <p className="text-sm md:text-base font-bold text-white line-clamp-1">{it.title}</p>
                  <p className="text-[11px] md:text-xs text-gray-300 line-clamp-1 mt-0.5">CREAITE · AI 시네마</p>
                </div>
                <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur border border-white/30 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity">
                  <Plus className="w-4 h-4 text-white" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OttRedesignPreview() {
  return (
    <div className="h-screen overflow-y-auto bg-[#0a0a0a] text-white pb-12">
      <div className="max-w-[1800px] mx-auto px-4 pt-5 pb-2">
        <p className="text-xs text-[#a78bfa] font-bold tracking-widest uppercase">Preview · OTT 재설계</p>
        <p className="text-xs text-gray-500 mt-1">상단: 데스크탑 3분할 히어로 / 모바일 1개씩 5초 슬라이드 · 하단: 카테고리 행 좌우 교차 자동 흐름(마우스 올리면 정지)</p>
      </div>

      {/* 3분할 히어로 */}
      <div className="max-w-[1800px] mx-auto px-2 md:px-4 mb-8">
        <HeroPanels />
      </div>

      {/* 카테고리 마퀴 행 */}
      <div className="max-w-[1800px] mx-auto">
        {CATS.map((c) => <MarqueeRow key={c.title} cat={c} />)}
      </div>
    </div>
  );
}
