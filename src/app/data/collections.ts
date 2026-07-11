// ════════════════════════════════════════════════════════════════════════════
// CREAITE 컬렉션 — DB(collections/collection_videos) 기반 (2026-07-11 관리자화)
//   관리: 관리자 페이지 → 컬렉션·셀렉트(AdminCollections). get_collections() 로 로드.
//   아래 FALLBACK 은 DB 로드 전/실패(마이그레이션 미적용) 시에만 사용 — 사이트가 빈
//   컬렉션으로 깨지지 않게 하는 안전망. DB 값이 있으면 대체된다.
//   useCollections() 훅으로 구독하면 DB 로드 시 자동 재렌더.
// ════════════════════════════════════════════════════════════════════════════
import { useSyncExternalStore } from "react";
import { supabase } from "../utils/supabaseClient";

export interface Collection {
  slug: string;
  title: string;
  tagline: string;
  intro: string;      // 에디토리얼 소개(HTML: p/strong/em)
  emoji: string;
  gradient: string;
  date?: string;
  isSelect?: boolean; // CREAITE 셀렉트 배지 소스 컬렉션 여부
  videoIds: string[]; // 큐레이션 순서 보존
}

export const CREAITE_SELECT_SLUG = "creaite-select";

// ── 폴백(DB 미적용 시) — collections.ts 하드코딩 시절의 값 ────────────────────
const FALLBACK_COLLECTIONS: Collection[] = [
  {
    slug: CREAITE_SELECT_SLUG,
    title: "CREAITE 셀렉트",
    tagline: "에디터 공식 선정작 · 명예의 전당",
    emoji: "🏆",
    gradient: "from-[#f59e0b] to-[#ec4899]",
    isSelect: true,
    intro: `
<p><strong>CREAITE 셀렉트</strong>는 우리가 자신 있게 내세우는 작품에 부여하는 공식 선정입니다. 영화제의 'Official Selection'처럼, 이 배지는 <strong>"CREAITE가 골랐다"</strong>는 인장입니다.</p>
<p>완성도, 이야기의 힘, 그리고 AI 시네마의 가능성을 보여준 작품들이 이 명예의 전당에 오릅니다. 선정작에는 영상 카드와 상세 페이지에 <em>✦ CREAITE 셀렉트</em> 배지가 붙습니다. 창작자에게는 훈장이고, 관객에게는 "실패 없는 선택"의 표식입니다.</p>
<p>무엇을 볼지 고민된다면, 여기서 시작하세요. CREAITE가 보증하는 작품들입니다.</p>
`,
    videoIds: [
      "b74e4056-5dc8-4824-8807-3675cbe2b247",
      "bee906d7-6d7b-4c7a-a302-f9155b16eba9",
      "bb0299c7-3b80-4dc4-833b-a265e78f4e97",
      "a93224cf-2e62-4049-8e60-c2eed710ed2e",
      "269be30c-9fd1-4094-bc9a-6b0ef6512d69",
    ],
  },
  {
    slug: "first-watch",
    title: "처음이라면, 이 다섯 편",
    tagline: "AI 시네마 입문 셀렉션",
    emoji: "🎟️",
    gradient: "from-[#6366f1] to-[#8b5cf6]",
    intro: `
<p>"AI로 만든 영화, 대체 어떤 느낌일까?" 처음 CREAITE에 온 분이라면 이 다섯 편으로 시작하세요. 장르도, 길이도, 온도도 일부러 다르게 골랐습니다. <strong>짧지만 각기 다른 결</strong>을 가진 작품들이라, 15분이면 AI 시네마가 어디까지 왔는지 감이 잡힙니다.</p>
<p>SF의 서늘함, 드라마의 여운, 로맨스의 설렘 — 한 편씩 넘기다 보면 자연스럽게 취향이 드러날 겁니다. 마음에 드는 장르를 찾았다면, 그 갈래를 더 깊이 파고드는 다른 컬렉션으로 이어 가 보세요.</p>
`,
    videoIds: [
      "c9ef3216-32b8-4917-8ca9-438b94051697",
      "e45b9277-2864-4d26-aa09-f605aa0224ce",
      "669b092e-74eb-488f-a789-f6dc6632217d",
      "c2b4d02b-2be8-4278-8f7d-d665a6515c9f",
      "668b0680-d606-4b08-a915-14bb6523a57d",
    ],
  },
  {
    slug: "quick-punch",
    title: "짧고 강렬한",
    tagline: "1분 안에 끝나는 숏필름 셀렉션",
    emoji: "⚡",
    gradient: "from-[#10b981] to-[#06b6d4]",
    intro: `
<p>시간이 없을 때, 딱 한 편. 1분 안에 강한 인상을 남기는 <strong>숏필름</strong>만 모았습니다. 길이는 짧지만 밀도는 높습니다 — 단 몇십 초 안에 하나의 장면, 하나의 감정을 완결하는 작품들입니다.</p>
<p>짧은 영상일수록 <em>버릴 것이 없어야</em> 합니다. 군더더기 없는 컷, 한 방의 연출, 여운을 남기는 마무리. 출퇴근길 한 편, 쉬는 시간 한 편 — 부담 없이 즐기면서도, AI 숏필름의 완성도를 확인하기 좋은 셀렉션입니다.</p>
`,
    videoIds: [
      "e21d3001-1265-47d8-81e4-f2a5a6993a50",
      "c9ef3216-32b8-4917-8ca9-438b94051697",
      "c2b4d02b-2be8-4278-8f7d-d665a6515c9f",
      "e45b9277-2864-4d26-aa09-f605aa0224ce",
      "f8382a4b-7e58-479a-a063-ad418440a248",
      "668b0680-d606-4b08-a915-14bb6523a57d",
    ],
  },
  {
    slug: "night-tension",
    title: "긴장의 밤",
    tagline: "액션 · 스릴러 · 공포 셀렉션",
    emoji: "🌙",
    gradient: "from-[#ef4444] to-[#6366f1]",
    intro: `
<p>불을 끄고 소리를 키우세요. 심장이 빨라지는 밤을 위한 셀렉션입니다. 총성과 추격의 <strong>액션</strong>, 서늘한 반전의 <strong>스릴러</strong>, 보이지 않는 것이 더 무서운 <strong>공포</strong>까지 — 긴장이라는 하나의 감정을 여러 각도에서 담았습니다.</p>
<p>특히 주목할 점은 <em>카메라의 속도</em>입니다. 액션의 흔들리는 핸드헬드, 스릴러의 느리게 조여드는 시선, 공포의 숨죽인 정적 — 같은 '긴장'도 연출에 따라 이렇게 다른 질감이 됩니다. AI 영상이 어떻게 감정을 설계하는지 보고 싶다면 이 컬렉션이 좋은 교재입니다.</p>
`,
    videoIds: [
      "a5806b5f-93a3-45c8-8ba6-432e3939aa52",
      "37ef786b-f4c5-49c5-93dc-cf405a99cde2",
      "c2b4d02b-2be8-4278-8f7d-d665a6515c9f",
      "42bc84e3-6685-447b-9741-02f0b3671218",
      "a93224cf-2e62-4049-8e60-c2eed710ed2e",
    ],
  },
  {
    slug: "heart-stays",
    title: "마음이 머무는 곳",
    tagline: "드라마 · 로맨스 셀렉션",
    emoji: "💗",
    gradient: "from-[#ec4899] to-[#f59e0b]",
    intro: `
<p>모든 이야기가 빠를 필요는 없습니다. 천천히 스며들어 오래 남는 작품들을 모았습니다. 스무 살의 설렘과 이별, 황혼의 노스탤지어, 무언가를 끝까지 지켜낸 사람의 뒷모습 — <strong>감정의 온도</strong>가 주인공인 셀렉션입니다.</p>
<p>이 컬렉션의 작품들은 화려한 스펙터클 대신 <em>빛과 색, 그리고 침묵</em>으로 마음을 건드립니다. 따뜻한 골든아워 조명, 얕은 피사계 심도, 여백을 두는 편집 — AI 영상이 액션만이 아니라 '정서'도 담을 수 있다는 증거입니다. 조용한 밤, 한 편씩 천천히 보기를 권합니다.</p>
`,
    videoIds: [
      "bb0299c7-3b80-4dc4-833b-a265e78f4e97",
      "669b092e-74eb-488f-a789-f6dc6632217d",
      "e45b9277-2864-4d26-aa09-f605aa0224ce",
      "f8382a4b-7e58-479a-a063-ad418440a248",
    ],
  },
  {
    slug: "beyond-the-edge",
    title: "경계 너머",
    tagline: "SF · 판타지 셀렉션",
    emoji: "🚀",
    gradient: "from-[#06b6d4] to-[#8b5cf6]",
    intro: `
<p>현실의 규칙이 통하지 않는 곳으로 가는 셀렉션입니다. 성층권을 넘는 종이비행기, 마지막 교신 너머의 우주, 천사군단이 벌이는 전쟁 — <strong>상상이 곧 장르</strong>가 되는 작품들을 모았습니다.</p>
<p>SF와 판타지는 AI 영상이 가장 빛나는 영역입니다. 실사로 찍으려면 천문학적 예산이 필요한 장면을, 한 사람이 프롬프트로 만들어 냅니다. <em>규모감과 세계관</em>이 핵심인 이 장르에서, 창작자의 상상력이 어디까지 확장되는지 확인해 보세요. AI 시네마의 진짜 가능성이 여기 있습니다.</p>
`,
    videoIds: [
      "bee906d7-6d7b-4c7a-a302-f9155b16eba9",
      "269be30c-9fd1-4094-bc9a-6b0ef6512d69",
      "c9ef3216-32b8-4917-8ca9-438b94051697",
      "d5d80e41-14b4-40dc-87eb-ea1d5836d4b3",
      "668b0680-d606-4b08-a915-14bb6523a57d",
    ],
  },
];

// ── 스토어 (DB 로드분으로 대체) ──────────────────────────────────────────────
let _collections: Collection[] = FALLBACK_COLLECTIONS;
let _selectIds: Set<string> = computeSelectIds(FALLBACK_COLLECTIONS);
const _listeners = new Set<() => void>();
let _loaded = false;

function computeSelectIds(cols: Collection[]): Set<string> {
  const sel = cols.find((c) => c.isSelect || c.slug === CREAITE_SELECT_SLUG);
  return new Set(sel?.videoIds ?? []);
}

/** 앱 시작 시 1회 호출 — DB(get_collections)에서 로드. 실패/빈 결과면 폴백 유지. */
export async function loadCollections(): Promise<void> {
  if (_loaded) return;
  _loaded = true;
  try {
    const { data, error } = await supabase.rpc("get_collections");
    if (error || !Array.isArray(data) || data.length === 0) return;
    _collections = (data as any[]).map((r) => ({
      slug: r.slug,
      title: r.title,
      tagline: r.tagline || "",
      intro: r.intro || "",
      emoji: r.emoji || "",
      gradient: r.gradient || "",
      isSelect: !!r.is_select,
      videoIds: (r.video_ids as string[]) || [],
    }));
    _selectIds = computeSelectIds(_collections);
    _listeners.forEach((l) => l());
  } catch {
    /* 폴백 유지 */
  }
}

// non-hook 접근(현재 스토어 조회) — 재렌더가 필요 없는 곳에서 사용.
export function getCollection(slug: string): Collection | undefined {
  return _collections.find((c) => c.slug === slug);
}
export function isCreaiteSelect(videoId: string | null | undefined): boolean {
  return !!videoId && _selectIds.has(videoId);
}

// ── 구독 훅 — DB 로드 시 자동 재렌더 ─────────────────────────────────────────
function subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}
export function useCollections() {
  const collections = useSyncExternalStore(subscribe, () => _collections, () => _collections);
  return {
    collections,
    getCollection: (slug: string) => collections.find((c) => c.slug === slug),
    isCreaiteSelect: (id: string | null | undefined) => !!id && _selectIds.has(id),
  };
}
