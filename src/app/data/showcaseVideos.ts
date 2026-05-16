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
//
// 이미지 소스: Pollinations.ai (무료 AI 이미지 생성)
//   - seed 기반 결정적 이미지 (같은 prompt+seed → 같은 이미지, 캐시됨)
//   - 장르별 시네마틱 프롬프트로 영화 포스터/스틸 느낌
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
// 장르별 시네마 영화 제목 풀 (각 10개씩)
// 영화 포스터에 어울리는 강렬하고 시네마틱한 제목
// ────────────────────────────────────────────────────────────────────────────
const TITLES: Record<string, string[]> = {
  drama: [
    "마지막 빛", "침묵의 도시", "잊혀진 사람들", "운명의 조각", "그날의 약속",
    "사라진 시간", "검은 강", "끝나지 않은 길", "그림자의 가족", "이름 없는 영웅",
  ],
  action: [
    "코드명: 블랙스톰", "최후의 임무", "철의 심판", "어둠 속 추격자", "강철 도시",
    "그림자 군단", "마지막 카운트다운", "폭풍 속으로", "표적 제로", "검은 매의 귀환",
  ],
  thriller: [
    "13번째 증인", "거울 너머", "암호: 0731", "사라진 손님", "심야 통신",
    "이중 신원", "녹화된 진실", "잠금 해제", "마지막 호출", "검은 봉투",
  ],
  romance: [
    "별빛 아래 우리", "시간을 건넌 편지", "두 번째 봄", "비 오는 도시", "1년 후의 약속",
    "마지막 사랑의 형태", "은하 위 만남", "다시 만나는 계절", "한낮의 그리움", "고요한 새벽",
  ],
  comedy: [
    "어쩌다 영웅", "수상한 동거인", "갑자기 부자", "오해의 연속", "출근길 대소동",
    "엄마의 비밀 임무", "이상한 신입사원", "주말은 짧고", "도시의 사장님", "당황한 슈퍼히어로",
  ],
  horror: [
    "13층의 그림자", "벽 너머의 소리", "잊혀진 유산", "숨겨진 방", "거울 속 누군가",
    "새벽 3시의 손님", "텅 빈 복도", "오래된 사진", "잊혀진 이름", "마지막 손님",
  ],
  documentary: [
    "AI 시대의 인간", "사라지는 풍경", "장인의 마지막 손", "도시의 숨소리", "시간의 흔적",
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
  "sci-fi": [
    "잊혀진 행성", "코드명: 새벽", "안드로이드의 꿈", "은하 너머 메시지", "시간 너머의 도시",
    "AI의 마지막 결정", "별빛 호송선", "기억 거래소", "사이버 라이트", "차원의 끝",
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// 장르별 Unsplash photo IDs (시네마틱 큐레이션)
// 각 카테고리당 10개씩 → 영상 10개에 1:1 매핑
// ────────────────────────────────────────────────────────────────────────────
const UNSPLASH_IDS: Record<string, string[]> = {
  drama: [
    "1626814026160-2237a95fc5a0", "1627133805103-ce2d34ccdd37", "1594908900066-3f47337549d8",
    "1627133805065-5083466be4f7", "1574923930958-9b653a0e5148", "1541415109140-571dd7c83b75",
    "1618343931116-fadc431fdec3", "1664965943537-c684dfe9ef7a", "1604686596451-1ff767bb85f3",
    "1514823898861-b1babeb0351d",
  ],
  action: [
    "1534188278934-76700c2da08b", "1575919220112-0d5a2dc6a4b6", "1485846234645-a62644f84728",
    "1514514188727-ff38e839635e", "1635281844773-dc254011367f", "1598899134739-24c46f58b8c0",
    "1645808651017-c5e3018553c7", "1614215669710-7668c7352a7d", "1618371441505-be18023fbb98",
    "1700174561966-36ed87c7bbeb",
  ],
  thriller: [
    "1710961232986-36cead00da3c", "1543121170-856f92d04651", "1462715412043-8d09205be605",
    "1510511450816-30c68106b199", "1652985808809-08b53267628b", "1622594078248-0a1f42ec2141",
    "1506813293631-ce71f060a35b", "1586254821734-d38724011094", "1506813138094-7ad38fe3f0cd",
    "1594471148841-f90c7033dbca",
  ],
  romance: [
    "1513279922550-250c2129b13a", "1615966650071-855b15f29ad1", "1496433998859-da21e208bd42",
    "1521033719794-41049d18b8d4", "1519307212971-dd9561667ffb", "1600251146518-aea8a1c27593",
    "1578660692094-da697dfc1c78", "1494403687614-8ca3e13f154f", "1567787783547-eb2b6722667d",
    "1568815641398-b3f655da2f8a",
  ],
  comedy: [
    "1485872299829-c673f5194813", "1541532713592-79a0317b6b77", "1519671482749-fd09be7ccebf",
    "1621112904887-419379ce6824", "1511988617509-a57c8a288659", "1628336707631-68131ca720c3",
    "1586105449897-20b5efeb3233", "1616189221668-386d14f76678", "1598495496118-f8763b94bde5",
    "1578990628400-94f031afbe3d",
  ],
  horror: [
    "1681488227384-0f4d02683dd7", "1483982258113-b72862e6cff6", "1494376877685-d3d2559d4f82",
    "1505635552518-3448ff116af3", "1635488129873-ddacde2c1927", "1574619151033-a9e1f81cae52",
    "1635488130393-7de972be026e", "1586783817135-49c40d8cca3b", "1712777691122-8a10db0a78a2",
    "1635958063871-f61b2ebf1db7",
  ],
  documentary: [
    "1472396961693-142e6e269027", "1598607993929-b48389d1de94", "1606804235853-a2bdff23724b",
    "1537616930345-1d330ad3e0a9", "1727243782424-28fd4187c657", "1651707265633-6043d4606339",
    "1636797521934-c6e69e592a3e", "1615148109219-6af9bff46b80", "1677915762650-ae9b94927467",
    "1726335849487-fd5d3b63b87c",
  ],
  animation: [
    "1605721911519-3dfeb3be25e7", "1541961017774-22349e4a1262", "1586032788085-d75f745f26e0",
    "1599422314077-f4dfdaa4cd09", "1532640331846-d2da5987c3ee", "1599753894977-bc6c162417e6",
    "1524664399170-77e7118fdb6d", "1523895665936-7bfe172b757d", "1533050401931-2900b7627a11",
    "1532540983331-3260f8487880",
  ],
  music: [
    "1459749411175-04bf5292ceea", "1563841930606-67e2bce48b78", "1470229722913-7c0e2dbbafd3",
    "1576514129883-2f1d47a65da6", "1514525253161-7a46d19cd819", "1524368535928-5b5e00ddc76b",
    "1565035010268-a3816f98589a", "1522158637959-30385a09e0da", "1540039155733-5bb30b53aa14",
    "1488036106564-87ecb155bb15",
  ],
  "sci-fi": [
    "1519608487953-e999c86e7455", "1672872476232-da16b45c9001", "1602136773736-34d445b989cb",
    "1560671021-cb36f70ce82d", "1600998837340-4887228e311f", "1668211834355-2cdf073f2351",
    "1535391879778-3bae11d29a24", "1600748338443-f7ea1054ed6b", "1525790935716-36a6c45ad067",
    "1531113165519-5eb0816d7e02",
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

// Unsplash 이미지 URL (안정적 CDN, 시네마틱 큐레이션)
function unsplashUrl(category: string, idx: number): string {
  const ids = UNSPLASH_IDS[category] || UNSPLASH_IDS.drama;
  const id = ids[idx % ids.length];
  return `https://images.unsplash.com/photo-${id}?w=640&h=360&fit=crop&q=80`;
}

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
        thumbnail: unsplashUrl(category, i),
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
