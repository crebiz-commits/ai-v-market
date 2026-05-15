// ════════════════════════════════════════════════════════════════════════════
// Showcase Videos — 베타 오픈 전 사이트가 풍부해 보이게 하는 Mock 영상 100개
//
// 토글: src/app/utils/showcase.ts 의 SHOWCASE_ENABLED 상수
//
// 표시 규칙:
//   - 관리자(profile.is_admin): Mock 안 보임 (실제 데이터만)
//   - 비관리자(일반 로그인 + 비로그인): Mock + 실제 데이터 합쳐서 보임
//
// 클릭 처리:
//   - 모든 Mock id는 "demo-" prefix → 진입 차단 + "곧 공개 예정" 토스트
//
// 베타 오픈 시:
//   src/app/utils/showcase.ts 에서 SHOWCASE_ENABLED = false 한 줄 변경 → 사라짐
// ════════════════════════════════════════════════════════════════════════════

export interface ShowcaseVideo {
  id: string;
  thumbnail: string;
  title: string;
  creator: string;
  creatorId?: string;
  price: number;
  duration: string;
  durationSeconds: number;
  resolution: string;
  tool: string;
  category: string;
  views: number;
  likes: number;
  videoUrl?: string;
  ai_tool?: string;
  tags?: string;
  created_at?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 카테고리별 영상 제목 풀
// ────────────────────────────────────────────────────────────────────────────
const TITLES: Record<string, string[]> = {
  drama: [
    "가족의 비밀", "마지막 편지", "그 여름의 약속", "흩어진 기억", "아버지의 일기",
    "되돌아온 시간", "잊혀진 골목", "어머니의 정원", "사라진 친구", "한낮의 침묵",
  ],
  action: [
    "검은 도시", "추격자의 그림자", "폭주", "쾌속 추격", "마지막 임무",
    "심야의 결투", "은밀한 작전", "잠입자", "최후의 반격", "강철의 약속",
  ],
  thriller: [
    "13호실의 비밀", "거울 속의 그녀", "심야 통화", "사라진 손님", "검은 우편",
    "이중 신원", "그날 밤 무슨 일이", "녹화된 진실", "마지막 증인", "암호: 0731",
  ],
  romance: [
    "벚꽃이 지던 날", "너에게 닿기를", "두 번째 봄", "별빛 아래 약속", "비 오는 카페",
    "1년 후 같은 자리", "편지가 도착했다", "첫눈 내리는 시간", "다시 만난 우리", "그날의 대화",
  ],
  comedy: [
    "어쩌다 사장", "오늘부터 1일", "수상한 동거인", "출근길 대소동", "엄마의 핸드폰",
    "이상한 신입", "갑자기 부자", "오해의 연속", "주말은 짧고", "눈물의 다이어트",
  ],
  horror: [
    "13층의 비밀", "벽 너머의 소리", "그림자가 움직였다", "잊혀진 유산", "숨겨진 방",
    "거울 속 누군가", "새벽 3시의 손님", "텅 빈 복도", "오래된 사진", "잊혀진 이름",
  ],
  documentary: [
    "도시의 숨소리", "사라지는 풍경", "장인의 손", "AI가 만난 예술", "시간의 흔적",
    "골목길 사람들", "잊혀진 직업", "1초의 세계", "바람의 기록", "물의 여행",
  ],
  animation: [
    "별을 그리는 아이", "구름 위 우체부", "작은 정원사", "달빛 도서관", "고양이의 모험",
    "꿈 가게 주인", "유리병 친구", "마법 우산", "은하수 카페", "하늘 정원",
  ],
  music: [
    "여름밤의 기타", "도시 속 멜로디", "재즈의 시간", "비트의 리듬", "어쿠스틱 오후",
    "EDM 페스티벌", "클래식 산책", "발라드의 향기", "신스웨이브 드라이브", "K-팝 라이브",
  ],
  shorts: [
    "5초의 마법", "한 컷의 감동", "찰나의 순간", "10초 챌린지", "초고속 요리",
    "원샷 메이크업", "1분 운동", "퀵 팁: 영상 편집", "30초 명상", "초미니 브이로그",
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// Mock 크리에이터 풀
// ────────────────────────────────────────────────────────────────────────────
const CREATORS = [
  { id: "demo-creator-1",  name: "AI 스튜디오" },
  { id: "demo-creator-2",  name: "픽셀 드림" },
  { id: "demo-creator-3",  name: "네온 비전" },
  { id: "demo-creator-4",  name: "달빛 영화관" },
  { id: "demo-creator-5",  name: "코드 시네마" },
  { id: "demo-creator-6",  name: "별빛 프로덕션" },
  { id: "demo-creator-7",  name: "프리즘 미디어" },
  { id: "demo-creator-8",  name: "오로라 웍스" },
  { id: "demo-creator-9",  name: "메타 캔버스" },
  { id: "demo-creator-10", name: "아틀란티스 픽처스" },
];

const AI_TOOLS = ["Sora", "Runway", "Pika", "Kling", "Luma", "Veo", "Midjourney"];
const RESOLUTIONS = ["1080p", "1440p", "4K"];

// 1초 ~ 3시간 사이 다양한 길이
const DURATION_TEMPLATES: { seconds: number; text: string }[] = [
  { seconds: 8, text: "0:08" },
  { seconds: 15, text: "0:15" },
  { seconds: 30, text: "0:30" },
  { seconds: 60, text: "1:00" },
  { seconds: 90, text: "1:30" },
  { seconds: 180, text: "3:00" },
  { seconds: 300, text: "5:00" },
  { seconds: 600, text: "10:00" },
  { seconds: 900, text: "15:00" },
  { seconds: 1800, text: "30:00" },
  { seconds: 3600, text: "1:00:00" },
  { seconds: 5400, text: "1:30:00" },
  { seconds: 7200, text: "2:00:00" },
];

// 결정적 의사 난수 (시드 기반) — 빌드마다 동일한 mock을 보장
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const PRICE_OPTIONS = [0, 0, 0, 0, 9900, 19000, 29000, 49000, 99000, 290000, 990000];

// ────────────────────────────────────────────────────────────────────────────
// Mock 영상 100개 생성
// ────────────────────────────────────────────────────────────────────────────
function generateShowcaseVideos(): ShowcaseVideo[] {
  const rand = seededRandom(20260516);
  const videos: ShowcaseVideo[] = [];
  const categories = Object.keys(TITLES);
  let counter = 0;

  // 카테고리별 10개씩 = 100개 (10 카테고리 × 10)
  for (const category of categories) {
    const titleList = TITLES[category];
    for (let i = 0; i < 10; i++) {
      counter++;
      const title = titleList[i % titleList.length] + (i >= titleList.length ? ` ${Math.floor(i / titleList.length) + 1}` : "");
      const creator = CREATORS[Math.floor(rand() * CREATORS.length)];
      const tool = AI_TOOLS[Math.floor(rand() * AI_TOOLS.length)];
      const resolution = RESOLUTIONS[Math.floor(rand() * RESOLUTIONS.length)];
      const dur = DURATION_TEMPLATES[Math.floor(rand() * DURATION_TEMPLATES.length)];
      const price = PRICE_OPTIONS[Math.floor(rand() * PRICE_OPTIONS.length)];
      const views = Math.floor(rand() * 500_000) + 100;
      const likes = Math.floor(views * (0.01 + rand() * 0.08));

      // 며칠~수개월 전 무작위 (created_at)
      const daysAgo = Math.floor(rand() * 180);
      const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

      videos.push({
        id: `demo-${counter}`,
        thumbnail: `https://picsum.photos/seed/creaite-demo-${counter}/640/360`,
        title,
        creator: creator.name,
        creatorId: creator.id,
        price,
        duration: dur.text,
        durationSeconds: dur.seconds,
        resolution,
        tool,
        ai_tool: tool,
        category,
        views,
        likes,
        tags: `${category},${tool.toLowerCase()},AI`,
        created_at: createdAt,
      });
    }
  }

  return videos;
}

export const SHOWCASE_VIDEOS: ShowcaseVideo[] = generateShowcaseVideos();

/** 카테고리별 Mock 영상 (필터링 용도) */
export function getShowcaseVideosByCategory(category?: string): ShowcaseVideo[] {
  if (!category || category === "all") return SHOWCASE_VIDEOS;
  return SHOWCASE_VIDEOS.filter((v) => v.category === category);
}

/** Mock 영상인지 ID로 판별 */
export function isShowcaseId(id: string | undefined | null): boolean {
  return !!id && id.startsWith("demo-");
}
