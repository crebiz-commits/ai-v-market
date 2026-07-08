// ════════════════════════════════════════════════════════════════════════════
// CREAITE 컬렉션 — 에디터가 고른 큐레이션 셀렉션
//   목록: /?info=collections   ·   개별: /?info=collections&c=<slug>
//   "배급사가 골랐다"는 큐레이션의 권위 + 원본 텍스트(SEO). videoIds 는 실제 영상 id.
//   상세 페이지가 이 id 로 DB에서 영상을 불러와 카드로 표시(숨김·삭제분은 자동 제외).
//   ※ 큐레이션은 편집 판단 — 새 작품이 쌓이면 여기 배열을 갱신.
// ════════════════════════════════════════════════════════════════════════════

export interface Collection {
  slug: string;
  title: string;
  tagline: string;
  intro: string;   // 에디토리얼 소개(HTML: p/strong/em)
  emoji: string;
  gradient: string;
  date: string;
  videoIds: string[];   // 큐레이션 순서 보존
}

// CREAITE 셀렉트 — "공식 선정작". 이 컬렉션에 든 작품은 영상 카드·상세에 셀렉트 배지 노출.
//   (배급사의 '인정' 장치 — 영화제 Official Selection 처럼. 배지 SSOT = 이 컬렉션의 videoIds)
export const CREAITE_SELECT_SLUG = "creaite-select";

export const COLLECTIONS: Collection[] = [
  {
    slug: CREAITE_SELECT_SLUG,
    title: "CREAITE 셀렉트",
    tagline: "에디터 공식 선정작 · 명예의 전당",
    emoji: "🏆",
    gradient: "from-[#f59e0b] to-[#ec4899]",
    date: "2026-07-08",
    intro: `
<p><strong>CREAITE 셀렉트</strong>는 우리가 자신 있게 내세우는 작품에 부여하는 공식 선정입니다. 영화제의 'Official Selection'처럼, 이 배지는 <strong>"CREAITE가 골랐다"</strong>는 인장입니다.</p>
<p>완성도, 이야기의 힘, 그리고 AI 시네마의 가능성을 보여준 작품들이 이 명예의 전당에 오릅니다. 선정작에는 영상 카드와 상세 페이지에 <em>✦ CREAITE 셀렉트</em> 배지가 붙습니다. 창작자에게는 훈장이고, 관객에게는 "실패 없는 선택"의 표식입니다.</p>
<p>무엇을 볼지 고민된다면, 여기서 시작하세요. CREAITE가 보증하는 작품들입니다.</p>
`,
    videoIds: [
      "b74e4056-5dc8-4824-8807-3675cbe2b247", // 바다의 신비 (다큐)
      "bee906d7-6d7b-4c7a-a302-f9155b16eba9", // 가장 가벼운 비행 (SF)
      "bb0299c7-3b80-4dc4-833b-a265e78f4e97", // 스물, 사랑하다 (로맨스)
      "a93224cf-2e62-4049-8e60-c2eed710ed2e", // 오마하의 새벽 (액션)
      "269be30c-9fd1-4094-bc9a-6b0ef6512d69", // 라스트 킥오프 (SF)
    ],
  },
  {
    slug: "first-watch",
    title: "처음이라면, 이 다섯 편",
    tagline: "AI 시네마 입문 셀렉션",
    emoji: "🎟️",
    gradient: "from-[#6366f1] to-[#8b5cf6]",
    date: "2026-07-08",
    intro: `
<p>"AI로 만든 영화, 대체 어떤 느낌일까?" 처음 CREAITE에 온 분이라면 이 다섯 편으로 시작하세요. 장르도, 길이도, 온도도 일부러 다르게 골랐습니다. <strong>짧지만 각기 다른 결</strong>을 가진 작품들이라, 15분이면 AI 시네마가 어디까지 왔는지 감이 잡힙니다.</p>
<p>SF의 서늘함, 드라마의 여운, 로맨스의 설렘 — 한 편씩 넘기다 보면 자연스럽게 취향이 드러날 겁니다. 마음에 드는 장르를 찾았다면, 그 갈래를 더 깊이 파고드는 다른 컬렉션으로 이어 가 보세요.</p>
`,
    videoIds: [
      "c9ef3216-32b8-4917-8ca9-438b94051697", // 마지막 교신 (SF)
      "e45b9277-2864-4d26-aa09-f605aa0224ce", // 챔피언의 황혼 (드라마)
      "669b092e-74eb-488f-a789-f6dc6632217d", // 골든 아워 (로맨스)
      "c2b4d02b-2be8-4278-8f7d-d665a6515c9f", // 상흔 (스릴러)
      "668b0680-d606-4b08-a915-14bb6523a57d", // 오버드라이브 (SF)
    ],
  },
  {
    slug: "quick-punch",
    title: "짧고 강렬한",
    tagline: "1분 안에 끝나는 숏필름 셀렉션",
    emoji: "⚡",
    gradient: "from-[#10b981] to-[#06b6d4]",
    date: "2026-07-08",
    intro: `
<p>시간이 없을 때, 딱 한 편. 1분 안에 강한 인상을 남기는 <strong>숏필름</strong>만 모았습니다. 길이는 짧지만 밀도는 높습니다 — 단 몇십 초 안에 하나의 장면, 하나의 감정을 완결하는 작품들입니다.</p>
<p>짧은 영상일수록 <em>버릴 것이 없어야</em> 합니다. 군더더기 없는 컷, 한 방의 연출, 여운을 남기는 마무리. 출퇴근길 한 편, 쉬는 시간 한 편 — 부담 없이 즐기면서도, AI 숏필름의 완성도를 확인하기 좋은 셀렉션입니다.</p>
`,
    videoIds: [
      "e21d3001-1265-47d8-81e4-f2a5a6993a50", // 최전선 (액션 15s)
      "c9ef3216-32b8-4917-8ca9-438b94051697", // 마지막 교신 (SF 15s)
      "c2b4d02b-2be8-4278-8f7d-d665a6515c9f", // 상흔 (스릴러 15s)
      "e45b9277-2864-4d26-aa09-f605aa0224ce", // 챔피언의 황혼 (드라마 29s)
      "f8382a4b-7e58-479a-a063-ad418440a248", // 코트의 전설 (드라마 31s)
      "668b0680-d606-4b08-a915-14bb6523a57d", // 오버드라이브 (SF 41s)
    ],
  },
  {
    slug: "night-tension",
    title: "긴장의 밤",
    tagline: "액션 · 스릴러 · 공포 셀렉션",
    emoji: "🌙",
    gradient: "from-[#ef4444] to-[#6366f1]",
    date: "2026-07-08",
    intro: `
<p>불을 끄고 소리를 키우세요. 심장이 빨라지는 밤을 위한 셀렉션입니다. 총성과 추격의 <strong>액션</strong>, 서늘한 반전의 <strong>스릴러</strong>, 보이지 않는 것이 더 무서운 <strong>공포</strong>까지 — 긴장이라는 하나의 감정을 여러 각도에서 담았습니다.</p>
<p>특히 주목할 점은 <em>카메라의 속도</em>입니다. 액션의 흔들리는 핸드헬드, 스릴러의 느리게 조여드는 시선, 공포의 숨죽인 정적 — 같은 '긴장'도 연출에 따라 이렇게 다른 질감이 됩니다. AI 영상이 어떻게 감정을 설계하는지 보고 싶다면 이 컬렉션이 좋은 교재입니다.</p>
`,
    videoIds: [
      "a5806b5f-93a3-45c8-8ba6-432e3939aa52", // 섬광 (액션)
      "37ef786b-f4c5-49c5-93dc-cf405a99cde2", // 섀도우 코드 (액션)
      "c2b4d02b-2be8-4278-8f7d-d665a6515c9f", // 상흔 (스릴러)
      "42bc84e3-6685-447b-9741-02f0b3671218", // 지켜보는 것 (공포)
      "a93224cf-2e62-4049-8e60-c2eed710ed2e", // 오마하의 새벽 (액션)
    ],
  },
  {
    slug: "heart-stays",
    title: "마음이 머무는 곳",
    tagline: "드라마 · 로맨스 셀렉션",
    emoji: "💗",
    gradient: "from-[#ec4899] to-[#f59e0b]",
    date: "2026-07-08",
    intro: `
<p>모든 이야기가 빠를 필요는 없습니다. 천천히 스며들어 오래 남는 작품들을 모았습니다. 스무 살의 설렘과 이별, 황혼의 노스탤지어, 무언가를 끝까지 지켜낸 사람의 뒷모습 — <strong>감정의 온도</strong>가 주인공인 셀렉션입니다.</p>
<p>이 컬렉션의 작품들은 화려한 스펙터클 대신 <em>빛과 색, 그리고 침묵</em>으로 마음을 건드립니다. 따뜻한 골든아워 조명, 얕은 피사계 심도, 여백을 두는 편집 — AI 영상이 액션만이 아니라 '정서'도 담을 수 있다는 증거입니다. 조용한 밤, 한 편씩 천천히 보기를 권합니다.</p>
`,
    videoIds: [
      "bb0299c7-3b80-4dc4-833b-a265e78f4e97", // 스물, 사랑하다 (로맨스)
      "669b092e-74eb-488f-a789-f6dc6632217d", // 골든 아워 (로맨스)
      "e45b9277-2864-4d26-aa09-f605aa0224ce", // 챔피언의 황혼 (드라마)
      "f8382a4b-7e58-479a-a063-ad418440a248", // 코트의 전설 (드라마)
    ],
  },
  {
    slug: "beyond-the-edge",
    title: "경계 너머",
    tagline: "SF · 판타지 셀렉션",
    emoji: "🚀",
    gradient: "from-[#06b6d4] to-[#8b5cf6]",
    date: "2026-07-08",
    intro: `
<p>현실의 규칙이 통하지 않는 곳으로 가는 셀렉션입니다. 성층권을 넘는 종이비행기, 마지막 교신 너머의 우주, 천사군단이 벌이는 전쟁 — <strong>상상이 곧 장르</strong>가 되는 작품들을 모았습니다.</p>
<p>SF와 판타지는 AI 영상이 가장 빛나는 영역입니다. 실사로 찍으려면 천문학적 예산이 필요한 장면을, 한 사람이 프롬프트로 만들어 냅니다. <em>규모감과 세계관</em>이 핵심인 이 장르에서, 창작자의 상상력이 어디까지 확장되는지 확인해 보세요. AI 시네마의 진짜 가능성이 여기 있습니다.</p>
`,
    videoIds: [
      "bee906d7-6d7b-4c7a-a302-f9155b16eba9", // 가장 가벼운 비행 (SF)
      "269be30c-9fd1-4094-bc9a-6b0ef6512d69", // 라스트 킥오프 (SF)
      "c9ef3216-32b8-4917-8ca9-438b94051697", // 마지막 교신 (SF)
      "d5d80e41-14b4-40dc-87eb-ea1d5836d4b3", // 타락한 천사군단과의 전쟁 (판타지)
      "668b0680-d606-4b08-a915-14bb6523a57d", // 오버드라이브 (SF)
    ],
  },
];

export function getCollection(slug: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.slug === slug);
}

// CREAITE 셀렉트 선정작 id 집합 (배지 판별용 SSOT)
const CREAITE_SELECT_IDS = new Set(
  (COLLECTIONS.find((c) => c.slug === CREAITE_SELECT_SLUG)?.videoIds) ?? [],
);
export function isCreaiteSelect(videoId: string | null | undefined): boolean {
  return !!videoId && CREAITE_SELECT_IDS.has(videoId);
}
