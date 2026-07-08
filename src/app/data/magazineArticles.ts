// ════════════════════════════════════════════════════════════════════════════
// CREAITE 매거진 — 원본 아티클 데이터
//   AI 영상 제작·크리에이터 수익·플랫폼 인사이트에 대한 오리지널 읽을거리.
//   (SEO/콘텐츠 마케팅 + 애드센스 "가치 있는 콘텐츠" 확보용. 각 글은 독립 URL:
//    /?info=magazine&article=<slug> — 공유·검색엔진 색인 가능)
//   본문은 신뢰 가능한 원본 텍스트. body 는 간단한 HTML(h3/p/ul/li/strong/a).
// ════════════════════════════════════════════════════════════════════════════

export type MagazineCategory = "가이드" | "제작기" | "인사이트" | "정책";

// 언어별 텍스트. 렌더 시 현재 언어(ko/en)로 선택. en 미제공 시 ko 폴백.
export type LocalizedText = { ko: string; en: string };

export interface MagazineArticle {
  slug: string;
  category: MagazineCategory;
  title: LocalizedText;
  excerpt: LocalizedText;
  date: string;        // YYYY-MM-DD
  readMinutes: number;
  emoji: string;
  gradient: string;    // 커버 배경 (tailwind gradient 조각)
  body: LocalizedText;  // HTML
}

// 원본(한글) 아티클. title/excerpt/body 는 평문 문자열 — 아래 ARTICLES_EN 과 합쳐 언어별로 노출.
interface RawArticle {
  slug: string;
  category: MagazineCategory;
  title: string;
  excerpt: string;
  date: string;
  readMinutes: number;
  emoji: string;
  gradient: string;
  body: string;
}

const RAW_ARTICLES: RawArticle[] = [
  {
    slug: "creaite-is-your-distributor",
    category: "인사이트",
    title: "당신이 만든 AI 영화, CREAITE가 배급사가 되어 드립니다",
    excerpt: "밤새 프롬프트를 다듬고, 수십 번 다시 생성하고, 클립을 잇고 색을 맞췄습니다. 그렇게 완성한 당신의 영화 — 이제 그것을 세상에 내보낼 '배급사'가 생겼습니다.",
    date: "2026-07-08",
    readMinutes: 6,
    emoji: "🎬",
    gradient: "from-[#ec4899] to-[#8b5cf6]",
    body: `
<p>영화를 한 편 만들어 본 사람은 압니다. 완성했을 때의 벅찬 마음도, 그리고 그다음에 찾아오는 막막함도. <strong>"이걸… 이제 어디에 올리지?"</strong></p>

<p>당신은 시간을 들였습니다. 머릿속 장면을 문장으로 옮기려 프롬프트를 수십 번 고쳐 썼고, 마음에 드는 컷이 나올 때까지 다시 생성하기를 반복했습니다. 여덟 개의 클립을 하나의 감정선으로 잇고, 색을 맞추고, 호흡을 다듬었습니다. AI가 도구를 쥐여 줬지만, <strong>그 도구로 '작품'을 만든 건 당신의 안목과 끈기</strong>였습니다.</p>

<p>그런데 그렇게 완성한 영화는, 대개 갈 곳이 없습니다.</p>

<h3>만드는 문턱은 사라졌는데, 내보내는 문턱은 그대로였다</h3>
<p>AI는 '제작'의 벽을 무너뜨렸습니다. 이제 한 사람이 노트북 앞에서 폭풍 속 전투기도, 심해의 고래도 만들 수 있습니다. 하지만 <strong>'배급'의 벽은 그대로 남아 있었습니다.</strong></p>
<p>범용 영상 플랫폼에 올리면, 당신의 시네마틱 단편은 강아지 영상과 게임 클립 사이에 파묻힙니다. 알고리즘은 '작품'과 '콘텐츠'를 구분하지 않고, 조회수 몇 회 끝에 잊힙니다. 어렵게 만든 영화가 <strong>가치를 인정받을 무대</strong>가 없었던 겁니다.</p>

<p>전통적으로 그 '무대'를 만들어 주는 건 <strong>배급사</strong>였습니다. 감독이 작품을 만들면, 배급사가 그것을 극장에 걸고, 관객에게 소개하고, 수익으로 연결했습니다. 문제는 그 배급사가 소수의 거대 기업이었고, 아무나 그 문을 두드릴 수 없었다는 점입니다.</p>

<h3>CREAITE가 하려는 일: 1인 감독을 위한 배급사</h3>
<p>그래서 CREAITE는 스스로를 이렇게 정의합니다. <strong>"1인 감독 시대의 배급사."</strong> 당신이 감독이라면, 우리는 당신의 작품을 세상에 내보내는 배급 파트너입니다. 구체적으로 이런 것들을 합니다.</p>

<h3>① 무대를 드립니다 — 큐레이션된 시네마·OTT</h3>
<p>당신의 영화는 조회수 경쟁에 던져지지 않습니다. 장르와 시간대에 맞춰 <strong>큐레이션된 시네마·OTT 코너</strong>에 배치됩니다. 액션은 액션답게, 몰입형 장편은 밤의 편성에 — '작품'으로서 관객을 만납니다.</p>

<h3>② 가치를 매길 방법을 드립니다 — 세 갈래 수익</h3>
<p>좋은 작품은 인정받아야 합니다. CREAITE에서 당신의 영화는 <strong>세 가지 방식으로 가치를 인정</strong>받습니다.</p>
<ul>
<li><strong>라이선스 판매</strong> — 잘 만든 영상은 다른 창작자·광고 제작자에게 소재로 팔립니다. 한 번 만든 작품이 여러 번 값을 합니다.</li>
<li><strong>구독 수익 분배</strong> — 프리미엄 구독료가 시청시간에 비례해 분배됩니다. 꾸준히 사랑받는 작품일수록 몫이 커집니다.</li>
<li><strong>광고 수익</strong> — 많은 사람이 보는 것 자체가 수익이 됩니다.</li>
</ul>
<p>자세한 구조는 <a href="?info=creator-revenue">크리에이터 수익 정책</a>에서 확인할 수 있습니다.</p>

<h3>③ 창작자의 이름을 지킵니다 — 투명한 제작 증빙</h3>
<p>배급사는 창작자의 권리를 대신 지켜 줍니다. CREAITE는 영상의 프롬프트·시드·사용 모델 같은 <strong>제작 정보를 함께 남겨</strong>, 이 작품이 어떻게 만들어졌는지를 투명하게 증명합니다. 표절 논란으로부터 당신을 지키고, 구매자에게 신뢰를 줍니다. (자세히: <a href="?info=magazine&article=ai-video-copyright-license">AI 영상 저작권·라이선스 완전 정리</a>)</p>

<h3>가치는 숨어 있으면 인정받지 못한다</h3>
<p>세상에는 이미 훌륭한 AI 영화들이 조용히 묻혀 있습니다. 만든 사람의 하드디스크 안에서, 또는 알고리즘의 바다 밑에서. 우리는 그 작품들이 <strong>무대 위로 올라와 값을 인정받기를</strong> 바랍니다.</p>

<p>당신이 시간과 정성을 들여 만든 그 영화. 이제 갈 곳이 있습니다. <a href="?tab=upload">CREAITE에 올리고</a>, 관객을 만나고, 가치를 인정받으세요. 카메라는 이미 당신 손에 있습니다. 배급사는, 여기 있습니다.</p>

<p class="text-white/50 text-sm">— CREAITE. 모두가 감독인 시대의 배급사.</p>
`,
  },
  {
    slug: "ai-video-prompt-formula",
    category: "가이드",
    title: "AI 영상 프롬프트, 이렇게 쓰면 결과가 달라진다 — 5요소 공식",
    excerpt: "같은 AI 툴을 써도 누구는 밋밋한 클립이, 누구는 시네마틱한 장면이 나옵니다. 차이는 대부분 프롬프트에 있습니다. 실전에서 검증된 5가지 요소를 정리했습니다.",
    date: "2026-07-08",
    readMinutes: 6,
    emoji: "✍️",
    gradient: "from-[#6366f1] to-[#8b5cf6]",
    body: `
<p>AI 영상 생성 툴은 최근 1~2년 사이 폭발적으로 발전했습니다. Seedance, Higgsfield, Sora 같은 도구들은 텍스트 한 줄, 이미지 한 장으로 수 초 분량의 영상을 만들어 줍니다. 그런데 막상 써 보면 이상합니다. 분명 같은 툴인데, 어떤 사람의 결과물은 광고 같고 어떤 사람의 결과물은 습작 같습니다. 이 차이의 8할은 <strong>프롬프트(지시문)</strong>에서 갈립니다.</p>

<p>CREAITE에 올라오는 완성도 높은 영상들을 분석해 보면 프롬프트에 공통된 구조가 있습니다. 우리는 이걸 <strong>5요소 공식</strong>이라고 부릅니다. 하나씩 뜯어보겠습니다.</p>

<h3>1. 룩(Look) — 전체 분위기와 화질감</h3>
<p>가장 먼저 정해야 할 건 "어떤 느낌의 영상인가"입니다. <em>cinematic(영화적), photorealistic(실사), hyper-realistic, dramatic lighting(극적인 조명), desaturated palette(탈색된 색감)</em> 같은 단어가 여기 들어갑니다. 룩을 지정하지 않으면 AI는 평균값, 즉 "그저 그런 스톡 영상" 같은 결과를 냅니다.</p>

<h3>2. 인물·피사체의 동작(Action)</h3>
<p>정지된 이미지가 아니라 <strong>영상</strong>이라는 걸 잊지 마세요. "한 남자가 창밖을 본다"가 아니라 "한 남자가 천천히 고개를 돌려 창밖을 바라보고, 빗방울이 유리를 타고 흐른다"처럼 <strong>움직임을 서술</strong>해야 합니다. 동작이 구체적일수록 프레임 사이의 연결이 자연스러워집니다.</p>

<h3>3. 배경·공간(Setting)</h3>
<p>어디서 벌어지는 일인가. 시간대(새벽/황혼/한낮), 장소(협곡/네온 도시/성층권), 날씨(폭풍/안개)를 명시합니다. 배경은 단순한 무대가 아니라 <strong>감정의 절반</strong>입니다. 같은 인물이라도 폭풍 구름 속과 일출의 궤도 위에서는 전혀 다른 이야기가 됩니다.</p>

<h3>4. 효과(Effect)</h3>
<p>렌즈 플레어, 슬로모션, 연기, 불꽃, 피사계 심도(depth of field) 같은 시각 효과입니다. 과하면 촌스럽지만, 한두 개의 정확한 효과는 "AI가 만든 티"를 지우고 프로덕션 퀄리티를 끌어올립니다.</p>

<h3>5. ★ 카메라 무빙 + 속도(가장 자주 빠지는 요소)</h3>
<p>초보와 숙련자를 가르는 결정적 차이가 여기 있습니다. 대부분의 사람은 "무엇을 찍을지"만 쓰고 "카메라가 어떻게 움직이는지"는 안 씁니다. <strong>slow tracking shot(느린 추적샷), dolly in(돌리 인), orbit(선회), low-angle(로우앵글), handheld(핸드헬드)</strong> — 여기에 <em>속도(slowly, rapidly)</em>까지 붙이면 영상은 순식간에 "촬영된 것"처럼 보입니다.</p>

<p>실제 예시로 비교해 봅시다.</p>
<ul>
<li><strong>약한 프롬프트:</strong> "비 오는 도시의 종이비행기"</li>
<li><strong>강한 프롬프트:</strong> "비 오는 네온 도시, 우산 쓴 인물 위를 지나는 종이비행기, 느린 트래킹샷으로 따라가며(slow tracking shot), 반사된 네온, 영화적 색보정, 35mm 렌즈 피사계 심도"</li>
</ul>

<p>두 번째 프롬프트는 룩(영화적 색보정), 동작(지나가는), 배경(네온 도시·비), 효과(반사·피사계 심도), 그리고 카메라 무빙+속도(느린 트래킹샷)를 모두 담고 있습니다. 결과물의 차이는 직접 만들어 보면 압도적입니다.</p>

<h3>정리</h3>
<p>프롬프트는 마법 주문이 아니라 <strong>연출 지시서</strong>입니다. 감독이 촬영감독에게 "이렇게 찍어 주세요"라고 말하듯, 5요소(룩·동작·배경·효과·★카메라무빙+속도)를 한 문장에 담아 보세요. 특히 5번 카메라 무빙은 절대 빠뜨리지 마세요. 그 한 줄이 습작과 작품을 가릅니다.</p>

<p>완성한 영상은 <a href="?tab=upload">CREAITE에 업로드</a>해 라이선스로 판매하거나, 시네마·OTT 코너에서 관객을 만날 수 있습니다.</p>
`,
  },

  {
    slug: "making-of-paper-wings",
    category: "제작기",
    title: "종이비행기 한 대의 여정 — AI 단편 '가장 가벼운 비행' 제작기",
    excerpt: "책상 위 종이비행기가 폭풍과 협곡, 네온 도시를 지나 우주에 닿기까지. 8개의 클립을 하나의 이야기로 엮은 과정을 공개합니다.",
    date: "2026-07-08",
    readMinutes: 5,
    emoji: "🛩️",
    gradient: "from-[#0ea5e9] to-[#6366f1]",
    body: `
<p>AI로 영화 한 편을 만든다는 건 어떤 과정일까요. CREAITE의 영상 제작 하네스로 완성한 2분짜리 단편 <strong>「가장 가벼운 비행」</strong>을 예로, 한 편이 만들어지는 흐름을 처음부터 끝까지 따라가 봅니다.</p>

<h3>1. 컨셉 — 하나의 오브젝트, 하나의 여정</h3>
<p>좋은 단편은 대개 단순한 아이디어에서 출발합니다. 이번 주제는 "가장 가벼운 것이 가장 높이 난다"였습니다. 주인공은 <strong>종이비행기 한 대</strong>. 값비싼 전투기들 사이를, 그 가벼운 종이 한 장이 유유히 통과해 마침내 우주에 닿는다는 은유입니다.</p>

<h3>2. 씬 분해 — 8개의 순간</h3>
<p>2분을 8개의 15초 클립으로 나눴습니다. 각 클립은 하나의 "순간"입니다.</p>
<ul>
<li>햇살 비껴드는 책상 위, 종이비행기의 이륙</li>
<li>번개 치는 폭풍 구름 속으로</li>
<li>검은 연기를 뚫는 스텔스 전투기, 그 곁을 스치는 종이비행기</li>
<li>황혼의 협곡 활공</li>
<li>네온 사이버펑크 도시, 붉은 눈의 추격기</li>
<li>고요한 새벽 하늘의 나란한 비행</li>
<li>성층권 — 지구의 곡선이 보이는 높이</li>
<li>우주 — 일출의 궤도 위</li>
</ul>
<p>중요한 건 <strong>연결</strong>입니다. 각 클립이 따로 놀지 않도록, 종이비행기라는 오브젝트와 "위로, 더 위로"라는 방향성을 모든 씬에 관통시켰습니다.</p>

<h3>3. 클립 생성 — 이미지에서 영상으로</h3>
<p>각 씬은 앞서 소개한 <a href="?info=magazine&article=ai-video-prompt-formula">프롬프트 5요소</a>에 따라 생성했습니다. 예컨대 협곡 씬은 "황혼의 사암 협곡, 절벽 사이를 활공하는 종이비행기, 로우앵글 추적샷, 실사, 골든아워 조명"처럼 룩·동작·배경·효과·카메라무빙을 모두 담았습니다.</p>

<h3>4. 합성 — 클립을 한 편으로</h3>
<p>8개의 클립을 하네스의 합성 단계로 이어 붙입니다. 이 단계에서 일어나는 일:</p>
<ul>
<li><strong>크로스페이드 전환</strong> — 컷과 컷 사이가 툭툭 끊기지 않도록 부드럽게 넘어갑니다.</li>
<li><strong>전체 페이드 인/아웃</strong> — 시작과 끝에 호흡을 줍니다.</li>
<li><strong>화면 규격 통일</strong> — 720p·30fps로 정규화해 어느 기기에서든 일정한 품질로 재생됩니다.</li>
</ul>

<h3>5. 등록 — 관객을 만나기</h3>
<p>완성본은 제목·설명·장르·연령등급을 붙여 CREAITE에 등록됩니다. 「가장 가벼운 비행」은 <strong>영화 / SF / 전체관람가</strong>로 분류됐습니다. 이제 시네마·OTT 코너에서 누구나 볼 수 있습니다.</p>

<h3>배운 것</h3>
<p>AI 영상 제작의 병목은 더 이상 "생성"이 아닙니다. 툴이 클립은 금방 뽑아 줍니다. 진짜 어려운 건 <strong>여러 클립을 하나의 감정선으로 묶는 편집과 연출</strong>입니다. 좋은 단편은 화려한 한 컷이 아니라, 평범한 여덟 컷을 잘 잇는 데서 나옵니다.</p>
`,
  },

  {
    slug: "how-creators-earn",
    category: "인사이트",
    title: "AI 영상 크리에이터가 돈 버는 3가지 방법: 라이선스·구독·광고",
    excerpt: "영상을 잘 만드는 것과 그걸로 수익을 내는 것은 다른 문제입니다. CREAITE 크리에이터가 수익을 만드는 세 갈래 길을 정리했습니다.",
    date: "2026-07-06",
    readMinutes: 5,
    emoji: "💰",
    gradient: "from-[#f59e0b] to-[#ef4444]",
    body: `
<p>"AI로 영상을 만들 수 있게 됐다"는 이야기는 이제 새롭지 않습니다. 진짜 질문은 그다음입니다. <strong>만든 영상으로 어떻게 수익을 낼 것인가.</strong> CREAITE에서 크리에이터가 돈을 버는 길은 크게 세 가지입니다. 각각의 성격이 다르니, 자기 콘텐츠에 맞는 조합을 찾는 게 중요합니다.</p>

<h3>1. 라이선스 판매 — 영상을 '자산'으로 판다</h3>
<p>가장 직접적인 방식입니다. 잘 만든 영상 클립은 다른 창작자·유튜버·광고 제작자에게 <strong>소재</strong>로서 가치가 있습니다. CREAITE 마켓에서는 영상마다 라이선스 가격을 매겨 판매할 수 있습니다. 한 번 만든 영상이 여러 번 팔릴 수 있다는 게 핵심입니다.</p>
<p>가격 정책은 유연합니다. 소액 단건 판매부터, 고가의 작품은 '별도 협의' 방식으로 구매자와 조율하는 것도 가능합니다. 단, 너무 짧은 영상은 소재로서의 활용도가 낮아 판매에 제한이 있을 수 있습니다.</p>

<h3>2. 구독 수익 분배 — 시청시간만큼 나눈다</h3>
<p>CREAITE는 OTT 성격의 프리미엄 구독을 운영합니다. 구독료로 모인 수익은 <strong>크리에이터들의 시청시간에 비례해</strong> 분배됩니다. 즉 내 작품이 오래, 많이 재생될수록 구독 풀에서 가져가는 몫이 커집니다.</p>
<p>이 모델의 장점은 <strong>롱테일</strong>입니다. 한 편의 대박이 아니어도, 꾸준히 시청되는 여러 편이 쌓이면 안정적인 수익원이 됩니다. 장편·몰입형 콘텐츠일수록 유리한 구조입니다.</p>

<h3>3. 광고 수익 — 노출이 곧 수익</h3>
<p>무료로 공개한 영상에는 광고가 붙을 수 있고, 그 노출에 따라 수익이 발생합니다. 라이선스처럼 '판매'가 일어나지 않아도, <strong>많은 사람이 보는 것</strong> 자체가 수익이 됩니다. 진입장벽이 낮아 초보 크리에이터가 첫 수익을 경험하기 좋은 경로입니다.</p>

<h3>세 가지를 어떻게 조합할까</h3>
<p>정답은 콘텐츠 성격에 따라 다릅니다.</p>
<ul>
<li><strong>고퀄 소재성 클립</strong>(멋진 풍경·액션 컷) → 라이선스 판매 중심</li>
<li><strong>몰입형 장편·시리즈</strong> → 구독 수익 분배 중심</li>
<li><strong>가볍고 바이럴한 숏폼</strong> → 광고 노출 중심</li>
</ul>
<p>대부분의 크리에이터는 이 셋을 섞습니다. 무료 숏폼으로 팬을 모으고, 그중 일부를 라이선스·구독으로 전환하는 식입니다.</p>

<p>구체적인 분배 비율과 정산 기준은 <a href="?info=creator-revenue">크리에이터 수익 정책</a> 페이지에서 확인할 수 있습니다. 중요한 건, AI가 제작 비용을 극적으로 낮춘 지금 <strong>"만들 수 있느냐"가 아니라 "어떻게 수익화하느냐"가 경쟁력</strong>이라는 점입니다.</p>
`,
  },

  {
    slug: "genre-directing-guide",
    category: "가이드",
    title: "장르가 분위기를 만든다 — AI 영상 장르별 연출 가이드",
    excerpt: "SF, 액션, 로맨스, 공포… 같은 소재라도 장르 코드를 알면 결과가 완전히 달라집니다. 대표 장르별 연출 포인트를 정리했습니다.",
    date: "2026-07-04",
    readMinutes: 7,
    emoji: "🎬",
    gradient: "from-[#8b5cf6] to-[#ec4899]",
    body: `
<p>관객은 첫 3초 안에 "이게 무슨 장르인지"를 직감합니다. 색, 조명, 카메라의 움직임, 속도 — 이 시각 언어가 장르를 만듭니다. AI 영상도 마찬가지입니다. 장르 코드를 프롬프트에 담으면 훨씬 설득력 있는 결과가 나옵니다. CREAITE의 대표 장르별로 연출 포인트를 짚어 봅니다.</p>

<h3>SF — 스케일과 차가움</h3>
<p>SF의 핵심은 <strong>규모감</strong>과 <strong>차가운 색온도</strong>입니다. 넓은 하늘, 거대한 구조물, 인물을 작게 배치해 세계의 크기를 강조하세요. 색은 블루·시안 계열로 차갑게. 카메라는 크고 느리게 움직입니다(sweeping wide shot, slow orbit). 네온·홀로그램 같은 인공광이 좋은 포인트가 됩니다.</p>

<h3>액션 — 속도와 무게</h3>
<p>액션은 <strong>카메라의 속도</strong> 그 자체가 연출입니다. 핸드헬드의 흔들림, 빠른 트래킹, 로우앵글로 올려다보는 위압감. 여기에 먼지·불꽃·잔해 같은 효과가 타격의 "무게"를 만듭니다. 슬로모션을 결정적 순간에만 한 번 쓰면 강조 효과가 큽니다.</p>

<h3>로맨스 — 부드러운 빛과 얕은 심도</h3>
<p>로맨스는 <strong>따뜻한 골든아워 조명</strong>과 <strong>얕은 피사계 심도</strong>(배경 흐림)가 문법입니다. 인물에 초점을 맞추고 배경을 부드럽게 날려 친밀감을 만듭니다. 카메라는 천천히, 인물을 감싸듯(gentle push-in). 파스텔·웜톤 색보정이 감정을 살립니다.</p>

<h3>공포 — 어둠과 정적, 그리고 절제</h3>
<p>공포의 힘은 보여주는 것보다 <strong>보여주지 않는 것</strong>에 있습니다. 깊은 그림자, 화면 대부분을 채우는 어둠, 불안한 정적. 카메라는 느리게 다가가되(slow creeping dolly), 결정적 순간까지 대상을 숨깁니다. 채도를 낮춘 차가운 색이 불안을 증폭합니다.</p>

<h3>자연·풍경 — 시간과 빛의 흐름</h3>
<p>비교적 최근 CREAITE에 추가된 장르입니다. 여기서는 <strong>드라마보다 분위기</strong>가 주인공입니다. 파도, 안개, 흐르는 구름처럼 자연의 리듬을 담고, 카메라는 최소한으로 움직입니다. "틀어두고 보는" 앰비언트 콘텐츠로 특히 잘 맞습니다.</p>

<h3>추상 — 규칙을 깨는 실험</h3>
<p>추상은 서사가 아니라 <strong>질감과 움직임</strong> 그 자체입니다. 유동하는 형태, 빛의 굴절, 반복되는 패턴. 정답이 없는 만큼 가장 실험적인 결과가 나오는 영역입니다. 새벽·밤 같은 몰입 시간대에 잘 어울립니다.</p>

<h3>장르는 '제약'이 아니라 '지름길'</h3>
<p>장르 코드를 안다는 건 관객과 이미 합의된 언어를 쓴다는 뜻입니다. 규칙을 알아야 의도적으로 비틀 수도 있습니다. 먼저 장르의 문법대로 한 편을 만들어 보고, 익숙해지면 자기만의 변주를 시도해 보세요. CREAITE는 11개 장르로 콘텐츠를 분류하니, 내 작품이 어느 코너에서 관객을 만날지 생각하며 만드는 것도 좋은 전략입니다.</p>
`,
  },

  {
    slug: "what-is-ai-cinema-ott",
    category: "인사이트",
    title: "AI 시네마 OTT란 무엇인가 — 넷플릭스와 유튜브 사이의 새 카테고리",
    excerpt: "누구나 감독이 될 수 있는 시대. CREAITE가 만들려는 건 스트리밍 서비스도, 영상 플랫폼도 아닌 그 사이의 무언가입니다.",
    date: "2026-07-02",
    readMinutes: 5,
    emoji: "🎥",
    gradient: "from-[#06b6d4] to-[#6366f1]",
    body: `
<p>영상 산업에는 오랫동안 두 개의 축이 있었습니다. 한쪽엔 <strong>넷플릭스</strong>로 대표되는 프리미엄 스트리밍 — 소수의 프로가 만든 고퀄 작품을 다수가 소비합니다. 다른 한쪽엔 <strong>유튜브</strong>로 대표되는 오픈 플랫폼 — 누구나 올리고 누구나 봅니다. 그런데 AI 영상 생성 기술이 이 구도를 흔들고 있습니다.</p>

<h3>제작 비용이 0에 수렴할 때</h3>
<p>과거 '영화적인 영상'은 장비·인력·예산의 벽 뒤에 있었습니다. 카메라, 조명, 배우, 로케이션, 후반작업 — 아마추어가 넘기 힘든 진입장벽이었죠. AI 영상 툴은 이 벽을 극적으로 낮췄습니다. 이제 한 사람이 노트북 앞에서 폭풍 속 전투기도, 심해의 고래도, 성층권의 종이비행기도 만들 수 있습니다.</p>
<p>그 결과 이상한 일이 벌어집니다. <strong>유튜브 같은 접근성으로, 넷플릭스 같은 비주얼을</strong> 만들 수 있게 된 겁니다. 기존의 두 축 사이에 빈 공간이 생겼습니다.</p>

<h3>CREAITE가 채우려는 자리</h3>
<p>CREAITE는 그 빈 공간을 <strong>'AI 시네마 OTT + 크리에이터 라이선스 마켓'</strong>이라고 정의합니다. 세 가지가 한 곳에 있습니다.</p>
<ul>
<li><strong>보는 곳(OTT·시네마):</strong> AI로 만든 시네마틱 영상을 장르·시간대별로 큐레이션해 감상합니다.</li>
<li><strong>만드는 곳(업로드·하네스):</strong> 누구나 자기 작품을 올려 관객을 만납니다.</li>
<li><strong>거래하는 곳(라이선스 마켓):</strong> 영상을 소재로 사고팔며 크리에이터가 수익을 냅니다.</li>
</ul>

<h3>'끌어온 영상'이 아니라 '만든 영상'</h3>
<p>중요한 구분이 있습니다. CREAITE는 다른 곳의 영상을 모아 보여주는 서비스가 아닙니다. <strong>AI로 새로 창작된 오리지널 영상</strong>이 올라오고, 그것이 관객과 만나고, 거래되는 곳입니다. 생성형 AI 시대에 걸맞은 창작·유통·수익의 순환을 한 플랫폼 안에 담으려는 시도입니다.</p>

<h3>아직은 시작</h3>
<p>이 카테고리는 이제 막 열리는 중입니다. 정답이 정해져 있지 않다는 건, 지금 뛰어드는 창작자에게 <strong>선점의 기회</strong>가 있다는 뜻이기도 합니다. AI가 도구의 문턱을 없앤 지금, 남은 경쟁력은 '무엇을, 어떻게 이야기하느냐'입니다. 카메라는 이미 모두의 손에 있습니다.</p>
`,
  },

  {
    slug: "ai-video-copyright-license",
    category: "정책",
    title: "AI로 만든 영상, 저작권은 누구 것? — 라이선스 완전 정리",
    excerpt: "AI 생성물의 권리 관계는 아직 낯섭니다. 창작자가 알아야 할 기본 개념과 CREAITE에서 영상을 안전하게 사고파는 법을 정리했습니다.",
    date: "2026-06-30",
    readMinutes: 6,
    emoji: "⚖️",
    gradient: "from-[#10b981] to-[#06b6d4]",
    body: `
<p>AI로 영상을 만들다 보면 자연스럽게 떠오르는 질문이 있습니다. <strong>"이 영상, 내 것이 맞나?"</strong> 그리고 "이걸 팔아도 되나?" AI 생성물의 권리 관계는 여전히 발전 중인 영역이지만, 창작자가 알아두면 좋은 기본 원칙과 실무 팁을 정리했습니다.</p>

<p class="text-white/50 text-sm">※ 이 글은 일반적인 이해를 돕기 위한 것으로, 법률 자문이 아닙니다. 구체적 사안은 전문가와 상담하세요.</p>

<h3>1. AI 생성물의 권리, 핵심 원칙</h3>
<p>대부분의 AI 영상 툴은 이용약관에서 <strong>생성 결과물의 상업적 이용을 이용자에게 허용</strong>합니다(구독 등급·서비스별로 다르므로 반드시 확인 필요). 즉 내가 프롬프트를 입력해 만든 영상은, 그 툴의 약관이 허용하는 범위 안에서 내가 활용·판매할 수 있는 경우가 많습니다.</p>
<p>다만 주의할 점이 있습니다. <strong>타인의 저작물·상표·초상을 모방한 결과물</strong>은 별개의 문제입니다. 실존 인물의 얼굴, 특정 브랜드 로고, 기존 영화·캐릭터를 그대로 재현한 영상은 AI로 만들었더라도 분쟁의 소지가 있습니다.</p>

<h3>2. CREAITE가 금지하는 것</h3>
<p>건강한 마켓을 위해 CREAITE는 다음을 명확히 금지합니다.</p>
<ul>
<li>실존 인물의 초상·퍼블리시티권을 침해하는 딥페이크성 콘텐츠</li>
<li>타인의 상표·저작물을 무단 모방한 AI 생성물</li>
<li>권리를 보증할 수 없는 콘텐츠의 라이선스 판매</li>
</ul>
<p>업로드 시 창작자는 자신이 그 영상에 대한 권리를 가지며, 제3자의 권리를 침해하지 않음을 보증하게 됩니다. 신고-삭제 절차도 운영합니다.</p>

<h3>3. 라이선스를 '판다'는 것의 의미</h3>
<p>CREAITE 마켓에서 영상을 판매한다는 건, 저작권 자체를 넘기는 게 아니라 <strong>사용 권리(라이선스)를 부여</strong>하는 것입니다. 판매자는 여전히 원작자로 남고, 구매자는 약정된 범위에서 그 영상을 사용할 권리를 얻습니다.</p>

<h3>4. AI 제작 증빙 — 투명성이 신뢰를 만든다</h3>
<p>CREAITE는 영상의 프롬프트·시드·사용 모델 같은 <strong>제작 정보를 함께 노출</strong>하도록 설계돼 있습니다. "이 영상이 어떻게 만들어졌는가"를 투명하게 밝히는 것은 표절 논란을 줄이고, 구매자에게 신뢰를 줍니다. AI 시대의 창작에서 투명성은 방어이자 경쟁력입니다.</p>

<h3>5. 창작자를 위한 실무 체크리스트</h3>
<ul>
<li>사용하는 AI 툴의 약관에서 <strong>상업적 이용·판매 허용 범위</strong>를 확인했는가</li>
<li>결과물에 실존 인물·브랜드·기존 IP가 무단으로 포함되지 않았는가</li>
<li>판매 시 라이선스 범위(개인/상업)를 명확히 표기했는가</li>
<li>제작 정보를 투명하게 밝혔는가</li>
</ul>

<p>권리 관계가 깔끔한 콘텐츠는 더 비싸게, 더 오래 팔립니다. 자세한 약관은 <a href="?info=terms">이용약관</a>에서 확인하세요. 창작의 문턱이 낮아진 만큼, <strong>권리를 지키는 창작</strong>이 장기적으로 더 큰 자산이 됩니다.</p>
`,
  },

  {
    slug: "first-ai-short-5-steps",
    category: "가이드",
    title: "처음 만드는 AI 단편 — 초보를 위한 5단계",
    excerpt: "AI 영상, 어디서부터 시작해야 할지 막막한가요? 첫 단편 한 편을 완성하기까지의 다섯 단계를 순서대로 정리했습니다.",
    date: "2026-07-05",
    readMinutes: 6,
    emoji: "🎯",
    gradient: "from-[#6366f1] to-[#06b6d4]",
    body: `
<p>AI 영상 도구를 처음 열면 누구나 같은 벽에 부딪힙니다. "뭘 만들지?" 그리고 "어떻게 시작하지?" 화려한 결과물들을 보면 기가 죽기도 합니다. 하지만 첫 단편은 생각보다 단순합니다. 아래 다섯 단계면 충분합니다.</p>

<h3>1단계 — 하나의 문장으로 컨셉 잡기</h3>
<p>거창할 필요 없습니다. "가장 가벼운 것이 가장 높이 난다"처럼 <strong>한 문장으로 요약되는 아이디어</strong>면 됩니다. 좋은 단편은 복잡한 줄거리가 아니라 선명한 하나의 감정·은유에서 나옵니다. 처음이라면 대사 없이 <strong>비주얼만으로 전달되는</strong> 주제가 훨씬 쉽습니다.</p>

<h3>2단계 — 3~8개의 '순간'으로 쪼개기</h3>
<p>2분짜리 영화를 통째로 만들려 하지 마세요. <strong>15초 안팎의 짧은 장면 여러 개</strong>로 나눕니다. 각 장면은 하나의 '순간'입니다. 시작(도입) → 전개(변화) → 절정(도달) 흐름만 잡아도 이야기가 됩니다.</p>

<h3>3단계 — 프롬프트 5요소로 각 장면 생성</h3>
<p>각 장면은 <a href="?info=magazine&article=ai-video-prompt-formula">프롬프트 5요소</a>(룩·동작·배경·효과·카메라무빙+속도)에 맞춰 만듭니다. 특히 <strong>카메라 무빙</strong>을 꼭 넣으세요. 한 번에 완벽한 컷이 안 나와도 괜찮습니다. 마음에 들 때까지 몇 번 다시 생성하는 게 정상입니다.</p>

<h3>4단계 — 이어 붙이기</h3>
<p>클립들을 순서대로 잇습니다. 컷과 컷 사이를 부드럽게 넘기는 <strong>크로스페이드</strong>, 시작과 끝의 <strong>페이드 인/아웃</strong>만 있어도 완성도가 확 올라갑니다. 음악을 한 곡 깔면 여러 클립이 하나의 작품처럼 묶입니다.</p>

<h3>5단계 — 올리고, 피드백 받기</h3>
<p>가장 중요한 마지막 단계. <strong>완성했으면 세상에 내보내세요.</strong> 하드디스크 속 영상은 늘지 않습니다. <a href="?tab=upload">CREAITE에 업로드</a>하고, 관객 반응을 보고, 다음 작품에 반영하세요. 첫 편은 서툴러도 됩니다. 두 번째, 세 번째가 빠르게 좋아집니다.</p>

<h3>완벽보다 완성</h3>
<p>초보가 가장 자주 빠지는 함정은 <strong>"더 다듬어야 한다"며 영영 안 올리는 것</strong>입니다. 첫 단편의 목표는 걸작이 아니라 <strong>완성</strong>입니다. 한 편을 끝까지 만들어 본 경험이, 열 편의 아이디어보다 값집니다.</p>
`,
  },

  {
    slug: "where-to-upload-ai-video",
    category: "인사이트",
    title: "AI 영상, 어디에 올려야 할까 — 범용 플랫폼 vs 전문 무대",
    excerpt: "힘들게 만든 AI 영화를 아무 데나 올리면 묻힙니다. 플랫폼 선택이 작품의 운명을 가르는 이유와 기준을 짚었습니다.",
    date: "2026-07-03",
    readMinutes: 5,
    emoji: "🧭",
    gradient: "from-[#8b5cf6] to-[#6366f1]",
    body: `
<p>영상을 완성하면 마지막 결정이 남습니다. <strong>"어디에 올릴까?"</strong> 이 선택은 생각보다 중요합니다. 같은 작품이라도 어느 무대에 서느냐에 따라 관객도, 평가도, 수익도 완전히 달라지기 때문입니다.</p>

<h3>범용 영상 플랫폼의 장단점</h3>
<p>거대한 범용 플랫폼은 <strong>도달 범위</strong>가 넓습니다. 이론상 수억 명이 볼 수 있습니다. 하지만 그만큼 경쟁도 무한하고, 알고리즘은 '작품성'이 아니라 '체류시간·클릭률'을 봅니다. 시네마틱 단편이 브이로그·게임 영상과 같은 잣대로 평가받고, 대개 파묻힙니다. 또한 라이선스 판매 같은 <strong>창작물 거래 기능</strong>은 없습니다.</p>

<h3>전문 무대의 가치</h3>
<p>반대로 특정 분야에 특화된 플랫폼은 도달 범위는 좁지만 <strong>맥락</strong>이 있습니다. AI 시네마를 보러 온 관객 앞에 AI 시네마를 내놓는 것 — 이 '맥락의 일치'가 작품의 가치를 살립니다. 큐레이션, 장르 분류, 창작자 간 커뮤니티, 그리고 <strong>작품을 사고파는 구조</strong>가 있다면 더욱 그렇습니다.</p>

<h3>선택 기준 체크리스트</h3>
<p>어디에 올릴지 고민된다면 이렇게 물어보세요.</p>
<ul>
<li>이 플랫폼의 관객은 <strong>내 장르를 보러 온 사람들인가?</strong></li>
<li>내 작품이 <strong>'콘텐츠'가 아니라 '작품'으로</strong> 취급되는가?</li>
<li>조회수 외에 <strong>수익화 경로</strong>(라이선스·구독·광고)가 있는가?</li>
<li>창작자의 <strong>권리와 제작 증빙</strong>이 보호되는가?</li>
</ul>

<h3>정답은 '병행'일 수도 있다</h3>
<p>물론 하나만 골라야 하는 건 아닙니다. 범용 플랫폼으로 <strong>넓게 알리고</strong>, 전문 무대에서 <strong>가치를 인정받고 거래하는</strong> 병행 전략도 좋습니다. 핵심은 "아무 데나 올리고 잊는 것"을 피하는 겁니다. 당신의 작품은 아무렇게나 소비되기엔 아깝습니다. CREAITE가 <a href="?info=magazine&article=creaite-is-your-distributor">1인 감독의 배급사</a>를 자처하는 이유가 여기 있습니다.</p>
`,
  },

  {
    slug: "ai-video-thumbnail-guide",
    category: "가이드",
    title: "썸네일이 절반이다 — AI 영상 첫인상 만드는 법",
    excerpt: "관객은 재생 버튼을 누르기 전에 이미 판단합니다. 클릭을 부르는 썸네일의 다섯 가지 원칙을 정리했습니다.",
    date: "2026-07-01",
    readMinutes: 4,
    emoji: "🖼️",
    gradient: "from-[#f59e0b] to-[#8b5cf6]",
    body: `
<p>아무리 잘 만든 영화도, 아무도 재생 버튼을 안 누르면 존재하지 않는 것과 같습니다. 그 버튼을 누르게 만드는 것이 <strong>썸네일</strong>입니다. 목록에서 스쳐 지나가는 0.5초, 관객은 썸네일만 보고 클릭 여부를 정합니다. 좋은 썸네일의 원칙을 짚어 봅니다.</p>

<h3>1. 한 장의 '결정적 순간'을 골라라</h3>
<p>영상 전체를 요약하려 하지 마세요. 가장 <strong>강렬한 한 프레임</strong>이 좋은 썸네일입니다. 절정의 순간, 시선을 사로잡는 구도, 감정이 폭발하는 표정 — 스토리 전체가 아니라 '궁금하게 만드는 한 컷'입니다.</p>

<h3>2. 작은 화면에서도 읽혀야 한다</h3>
<p>대부분의 관객은 모바일로 봅니다. 손톱만 한 크기에서도 <strong>피사체가 명확히 구분</strong>되는지 확인하세요. 너무 복잡한 화면, 작은 디테일은 축소되면 뭉개집니다. 단순하고 대비가 강한 이미지가 이깁니다.</p>

<h3>3. 대비와 밝기로 눈길을 끈다</h3>
<p>어두운 목록 화면에서는 <strong>밝고 대비 강한</strong> 썸네일이 튀어나와 보입니다. 반대로 온통 어두운 썸네일은 그냥 지나쳐집니다. 색의 대비, 빛과 그림자의 대비를 의도적으로 활용하세요.</p>

<h3>4. 표정과 시선의 힘</h3>
<p>인물이 있다면 <strong>표정</strong>이 가장 강력한 무기입니다. 사람은 본능적으로 얼굴과 감정에 시선이 갑니다. 정면을 응시하거나, 강한 감정을 드러내는 순간을 고르면 클릭률이 올라갑니다.</p>

<h3>5. 제목과 겹치지 않게</h3>
<p>썸네일에 이미 이야기가 담겨 있다면, 제목은 다른 정보를 줘야 합니다. 썸네일이 '분위기'를 보여주면 제목은 '무슨 일'인지 알려주는 식으로 <strong>역할을 나누세요.</strong> 둘이 같은 말을 반복하면 정보량이 절반으로 줄어듭니다.</p>

<h3>정리</h3>
<p>썸네일은 작품의 포스터입니다. 극장의 포스터가 영화의 첫인상을 결정하듯, 썸네일 한 장이 당신의 조회수를 좌우합니다. 완성 직후 '그냥 아무 프레임'을 쓰지 말고, <strong>가장 좋은 한 컷</strong>을 골라 첫인상을 설계하세요.</p>
`,
  },

  {
    slug: "power-of-series",
    category: "인사이트",
    title: "한 편보다 시리즈 — 연속 콘텐츠가 만드는 복리",
    excerpt: "대박 한 편보다, 꾸준한 시리즈가 크리에이터를 키웁니다. 연속물이 가진 세 가지 힘을 이야기합니다.",
    date: "2026-06-28",
    readMinutes: 5,
    emoji: "📚",
    gradient: "from-[#10b981] to-[#6366f1]",
    body: `
<p>많은 창작자가 '대박 한 편'을 꿈꿉니다. 하지만 크리에이터를 실제로 키우는 건 대개 <strong>꾸준한 시리즈</strong>입니다. 왜 한 편의 홈런보다 연속 안타가 더 강력할까요?</p>

<h3>1. 관객이 '다음'을 기다린다</h3>
<p>단발성 영상은 소비되고 잊힙니다. 하지만 시리즈는 <strong>기대</strong>를 만듭니다. "다음 편이 궁금하다"는 감정은 관객을 다시 돌아오게 만드는 가장 강력한 장치입니다. 세계관·캐릭터·스타일이 이어지면, 관객은 한 편이 아니라 <strong>'당신'을 구독</strong>하기 시작합니다.</p>

<h3>2. 만들수록 쉬워진다</h3>
<p>시리즈의 숨은 이점은 <strong>제작 효율</strong>입니다. 첫 편에서 캐릭터 룩, 색감, 프롬프트 스타일을 정해 두면, 다음 편부터는 그 자산을 재사용합니다. 매번 처음부터 시작하지 않으니 갈수록 빠르고 안정적으로 만들 수 있습니다. AI 영상에서 <strong>일관된 캐릭터·톤을 유지하는 것</strong>은 특히 큰 무기입니다.</p>

<h3>3. 수익이 '복리'로 쌓인다</h3>
<p>CREAITE의 구독 수익은 시청시간에 비례해 분배됩니다. 시리즈가 쌓이면, 관객은 1편만 보고 끝나지 않고 <strong>여러 편을 연달아</strong> 봅니다. 한 편의 시청이 다음 편으로 이어지며 시청시간이 복리로 불어납니다. 라이선스 판매도 마찬가지 — 하나의 세계관에서 나온 여러 클립은 함께 팔릴 여지가 큽니다.</p>

<h3>거창하지 않아도 된다</h3>
<p>시리즈라고 대단한 프랜차이즈일 필요는 없습니다. "같은 장소의 사계절", "한 캐릭터의 하루", "매주 다른 감정을 담은 30초" — <strong>느슨한 연결고리 하나</strong>면 충분합니다. 중요한 건 관객이 "아, 이 사람 시리즈구나" 하고 알아보는 것입니다.</p>

<h3>오늘 시작하는 한 편이 시리즈의 1화</h3>
<p>완벽한 시리즈 기획을 세우고 시작할 필요는 없습니다. 오늘 만드는 한 편을 <strong>'1화'라고 생각</strong>하는 것만으로 충분합니다. 반응이 좋으면 이어 가고, 아니면 방향을 틀면 됩니다. 크리에이터의 성장은 대박이 아니라 <strong>축적</strong>에서 옵니다.</p>
`,
  },

  {
    slug: "ai-video-music-sound",
    category: "가이드",
    title: "소리가 절반이다 — AI 영상에 음악·사운드 입히는 법",
    excerpt: "화면을 눈으로 보는 동안, 감정은 귀로 들어옵니다. 예산 없이도 영상의 분위기를 완성하는 사운드 활용법을 정리했습니다.",
    date: "2026-06-26",
    readMinutes: 5,
    emoji: "🎵",
    gradient: "from-[#ec4899] to-[#f59e0b]",
    body: `
<p>실험을 하나 해보세요. 좋아하는 영화의 명장면을 음소거로 보면, 힘이 절반으로 줄어듭니다. 영상은 눈으로 보지만 <strong>감정은 귀로 들어오기</strong> 때문입니다. AI로 아무리 멋진 화면을 만들어도, 소리가 비면 완성이 아닙니다.</p>

<h3>1. 음악은 '장르'가 아니라 '감정'으로 고른다</h3>
<p>배경음악을 고를 때 흔한 실수가 "SF니까 전자음악"처럼 장르로 매칭하는 것입니다. 그보다 <strong>이 장면에서 관객이 느끼길 바라는 감정</strong>으로 고르세요. 긴장인지, 벅참인지, 쓸쓸함인지. 같은 화면도 음악에 따라 완전히 다른 이야기가 됩니다.</p>

<h3>2. 페이싱 — 음악의 리듬에 컷을 맞춘다</h3>
<p>프로의 편집은 음악의 <strong>비트</strong>에 컷 전환을 맞춥니다. 음악이 고조될 때 장면도 전환되고, 잔잔한 구간에서는 컷을 길게 둡니다. 이 '음악과 화면의 호흡 일치'가 아마추어와 프로를 가르는 미묘한 차이입니다.</p>

<h3>3. 정적도 소리다</h3>
<p>내내 음악을 깔 필요는 없습니다. 오히려 결정적 순간에 <strong>소리를 뚝 끊으면</strong> 강렬한 강조가 됩니다. 공포·긴장 장면에서 특히 효과적입니다. 소리를 '채우는 것'만큼 '비우는 것'도 연출입니다.</p>

<h3>4. 앰비언트 사운드로 현실감을 더한다</h3>
<p>음악 밑에 <strong>환경음</strong>(빗소리, 바람, 도시 소음)을 은은하게 깔면 장면이 훨씬 실재적으로 느껴집니다. 관객은 의식하지 못하지만, 그 미세한 소리가 "여기 진짜 공간이 있다"는 감각을 만듭니다.</p>

<h3>5. 볼륨 밸런스 — 음악은 화면을 '받쳐야' 한다</h3>
<p>음악이 너무 크면 화면을 압도하고, 너무 작으면 없느니만 못합니다. 배경음악은 <strong>주인공이 아니라 조연</strong>입니다. 화면과 나레이션(있다면)이 앞에 서고, 음악은 그 밑을 은은하게 받치는 정도가 좋습니다.</p>

<h3>예산이 없어도 된다</h3>
<p>요즘은 저작권 걱정 없는 무료·저가 음원 라이브러리가 많습니다. 중요한 건 비싼 음악이 아니라 <strong>장면에 맞는 음악</strong>입니다. 완성한 영상에 소리를 입히는 그 30분이, 작품의 인상을 통째로 바꿔 놓습니다. 화면만큼 소리에도 공을 들이세요.</p>
`,
  },

  {
    slug: "consistent-character",
    category: "가이드",
    title: "같은 얼굴 유지하기 — AI 영상 캐릭터 일관성의 기술",
    excerpt: "장면이 바뀔 때마다 주인공 얼굴이 달라지면 몰입이 깨집니다. AI 영상에서 캐릭터를 일관되게 유지하는 실전 방법을 정리했습니다.",
    date: "2026-06-24",
    readMinutes: 6,
    emoji: "🧑‍🎤",
    gradient: "from-[#6366f1] to-[#ec4899]",
    body: `
<p>AI 영상으로 이야기를 만들 때 가장 큰 벽이 있습니다. <strong>캐릭터 일관성.</strong> 1번 장면의 주인공과 3번 장면의 주인공이 다른 사람처럼 보이면, 관객은 이야기를 따라가다 길을 잃습니다. 서사가 있는 영상일수록 이 문제는 치명적입니다.</p>

<h3>왜 얼굴이 계속 바뀔까</h3>
<p>대부분의 생성 도구는 매번 새로 그림을 그립니다. "젊은 남자"라고만 하면, 매 생성마다 다른 젊은 남자가 나옵니다. AI에게 "지난번 그 사람"이라는 개념이 없기 때문입니다. 그래서 <strong>일관성은 저절로 생기지 않고, 의도적으로 만들어야</strong> 합니다.</p>

<h3>1. 캐릭터를 '문장'으로 고정한다</h3>
<p>주인공의 외형을 <strong>구체적인 고정 문구</strong>로 정의하고, 모든 장면 프롬프트에 똑같이 복붙하세요. "20대 후반 한국 남성, 짧은 검은 머리, 각진 턱선, 회색 후드티, 왼쪽 눈썹에 흉터" — 이렇게 디테일할수록 일관성이 올라갑니다. 두루뭉술하면 매번 달라집니다.</p>

<h3>2. 레퍼런스 이미지를 활용한다</h3>
<p>많은 도구가 <strong>참조 이미지(reference)</strong> 기능을 지원합니다. 마음에 드는 캐릭터 한 장을 정해 두고, 이후 장면을 그 이미지 기반으로 생성하면 얼굴이 훨씬 잘 유지됩니다. '캐릭터 시트'를 먼저 만들고 시작하는 것이 정석입니다.</p>

<h3>3. 얼굴을 매번 클로즈업하지 않는다</h3>
<p>영리한 우회법. 얼굴을 정면으로 크게 잡을수록 미세한 차이가 눈에 띕니다. <strong>뒷모습, 실루엣, 원거리 샷, 부분 샷</strong>을 섞으면 일관성 부담이 줄고 연출도 다채로워집니다. 정면 클로즈업은 정말 필요한 순간에만.</p>

<h3>4. 의상·소품으로 정체성을 고정한다</h3>
<p>얼굴이 조금 달라져도, <strong>같은 옷·같은 소품</strong>이면 관객은 같은 인물로 인식합니다. 빨간 목도리, 특정 재킷, 안대 하나 — 강한 시각적 표식 하나가 얼굴 열 번의 일관성보다 강력할 때가 있습니다. 영웅의 상징을 하나 정하세요.</p>

<h3>5. 완벽을 포기하고 '충분히'를 노린다</h3>
<p>현재 기술로 100% 동일한 얼굴은 어렵습니다. 목표를 <strong>"관객이 같은 사람으로 받아들이는 정도"</strong>로 낮추세요. 사람의 뇌는 생각보다 관대해서, 옷·머리·맥락이 맞으면 얼굴의 미세한 차이는 알아서 메꿔 이해합니다.</p>

<p>캐릭터 일관성은 AI 영상 서사의 핵심 난제이자, 잘 다루면 큰 차별점입니다. 인물이 살아 있는 이야기는 풍경만 예쁜 영상보다 오래 기억됩니다.</p>
`,
  },

  {
    slug: "color-grading-cinematic",
    category: "가이드",
    title: "색이 영화를 만든다 — AI 영상에 시네마틱 톤 입히기",
    excerpt: "'왠지 영화 같다'는 느낌의 정체는 대부분 색입니다. 후반 색보정으로 평범한 클립을 시네마틱하게 바꾸는 법.",
    date: "2026-06-22",
    readMinutes: 5,
    emoji: "🎨",
    gradient: "from-[#f59e0b] to-[#06b6d4]",
    body: `
<p>같은 장면인데 어떤 건 유튜브 영상 같고, 어떤 건 영화 같습니다. 그 차이의 큰 부분이 <strong>색</strong>입니다. 촬영이 끝난 뒤 색을 조율하는 '컬러 그레이딩'은 헐리우드가 마지막에 가장 공들이는 단계입니다. AI 영상도 마찬가지 — 생성으로 끝이 아니라, 색을 입혀야 완성입니다.</p>

<h3>1. 대비와 채도부터 손본다</h3>
<p>기본기입니다. 그림자를 조금 더 깊게(대비 ↑), 색을 살짝 눌러(채도 약간 ↓) 주면 즉시 '고급스러운' 느낌이 납니다. AI 생성물은 종종 색이 과하게 쨍한데, 이걸 살짝 눌러주는 것만으로 인상이 달라집니다.</p>

<h3>2. 색온도로 감정을 만든다</h3>
<p>따뜻한 톤(주황·금색)은 노스탤지어·로맨스·희망을, 차가운 톤(파랑·청록)은 고독·긴장·미래를 전합니다. <strong>장면의 감정에 맞는 색온도</strong>로 전체를 통일하면 화면이 하나의 정서로 묶입니다.</p>

<h3>3. '틸 앤 오렌지'의 마법</h3>
<p>블록버스터가 사랑하는 배색이 있습니다. <strong>인물(피부톤)은 따뜻한 오렌지, 배경(그림자)은 차가운 청록.</strong> 이 대비가 인물을 배경에서 도드라지게 하고 화면에 깊이를 줍니다. 과하면 촌스럽지만, 은은하게 쓰면 즉효약입니다.</p>

<h3>4. 전체를 하나의 톤으로 묶는다</h3>
<p>여러 클립을 이어 붙일 때 각 클립의 색감이 제각각이면 조각보처럼 보입니다. <strong>같은 색보정을 전체에 일괄 적용</strong>해 하나의 룩으로 통일하세요. 이것만으로 여러 클립이 '한 작품'처럼 느껴집니다.</p>

<h3>5. 비네팅과 필름 그레인, 소량으로</h3>
<p>화면 가장자리를 살짝 어둡게(비네팅) 하면 시선이 중앙으로 모입니다. 아주 미세한 필름 그레인(입자)은 디지털의 매끈함을 지우고 '필름' 질감을 더합니다. 둘 다 <strong>티 안 날 정도로 조금만</strong> 쓰는 게 핵심입니다.</p>

<h3>색보정은 '분위기'라는 언어다</h3>
<p>색은 관객이 의식하지 못하는 사이에 감정을 조종합니다. 촬영(생성)이 '무엇을 찍었나'라면, 색보정은 '어떤 기분으로 보게 할까'입니다. 완성한 영상에 30분만 색을 입혀 보세요. 같은 클립이 전혀 다른 격을 갖게 됩니다.</p>
`,
  },

  {
    slug: "title-that-clicks",
    category: "가이드",
    title: "제목이 운명을 가른다 — 클릭을 부르는 영상 제목 짓기",
    excerpt: "아무리 좋은 영화도 제목에서 지나쳐지면 끝입니다. 궁금증을 자극하되 낚시는 아닌, 좋은 제목의 원칙.",
    date: "2026-06-20",
    readMinutes: 4,
    emoji: "✒️",
    gradient: "from-[#8b5cf6] to-[#10b981]",
    body: `
<p>썸네일이 시선을 잡는다면, 제목은 <strong>클릭을 결정</strong>합니다. 관객은 목록에서 제목 몇 글자를 읽고 볼지 말지 정합니다. 공들여 만든 작품이 제목 한 줄 때문에 지나쳐진다면 너무 아깝습니다.</p>

<h3>1. 궁금증을 남겨라, 다 말하지 마라</h3>
<p>좋은 제목은 <strong>답이 아니라 질문</strong>을 던집니다. "종이비행기가 우주에 갔다"보다 "가장 가벼운 것이 가장 높이 난다"가 더 궁금합니다. 내용을 요약하지 말고, 보고 싶게 만드세요.</p>

<h3>2. 구체적인 것이 더 끌린다</h3>
<p>"멋진 우주 영상"은 아무 감흥이 없습니다. "일출의 궤도, 두 대의 종이비행기"는 그림이 그려집니다. <strong>추상적 형용사보다 구체적 이미지</strong>가 클릭을 부릅니다.</p>

<h3>3. 감정 단어를 하나 넣어라</h3>
<p>사람은 정보가 아니라 감정에 반응합니다. 제목에 <strong>감정을 자극하는 단어</strong> 하나(고요, 마지막, 추격, 그리움…)를 넣으면 온도가 확 올라갑니다. 건조한 사실 나열보다 강합니다.</p>

<h3>4. 낚시는 한 번은 통하고 영원히 잃는다</h3>
<p>가장 중요한 원칙. <strong>제목이 내용을 배신하면 안 됩니다.</strong> 과장된 낚시 제목은 클릭 한 번을 얻지만, 실망한 관객은 다시는 당신을 신뢰하지 않습니다. 크리에이터의 자산은 '이 사람 제목은 믿을 만하다'는 평판입니다.</p>

<h3>5. 길이는 짧게, 앞부분에 힘을</h3>
<p>목록에서 제목은 종종 뒷부분이 잘립니다. <strong>핵심 단어를 앞</strong>에 두고, 전체는 짧게. 모바일 화면에서 한눈에 읽히는 길이가 이상적입니다.</p>

<h3>제목은 작품의 첫 문장이다</h3>
<p>소설의 첫 문장이 독자를 끌어들이듯, 제목은 관객을 작품 안으로 초대하는 첫 문장입니다. 영상을 완성한 뒤 '아무 제목'을 붙이지 말고, 제목 짓기에도 5분만 더 투자하세요. 그 5분이 조회수를 몇 배로 바꿉니다.</p>
`,
  },

  {
    slug: "ai-video-trends-2026",
    category: "인사이트",
    title: "2026년, AI 영상은 어디로 가는가 — 지금의 흐름 읽기",
    excerpt: "도구는 매달 진화하고, 관객의 눈높이도 올라갑니다. 지금 AI 영상 창작에서 일어나고 있는 변화를 짚었습니다.",
    date: "2026-06-18",
    readMinutes: 5,
    emoji: "🔮",
    gradient: "from-[#06b6d4] to-[#8b5cf6]",
    body: `
<p>AI 영상 분야는 체감상 매달 달라집니다. 반년 전 '놀랍다'던 결과물이 지금은 평범해 보입니다. 기술이 평준화되는 지금, 창작의 무게중심이 어디로 옮겨가고 있는지 짚어 봅니다.</p>

<h3>1. '생성'에서 '연출'로</h3>
<p>초기엔 "AI로 영상을 만들 수 있다"는 사실 자체가 화제였습니다. 이제는 누구나 만듭니다. 그래서 경쟁의 축이 <strong>'만들 수 있는가'에서 '어떻게 연출하는가'로</strong> 이동했습니다. 프롬프트를 넘어 편집·색·사운드·서사가 실력을 가릅니다.</p>

<h3>2. 클립에서 '작품'으로</h3>
<p>멋진 15초 클립 하나로는 더 이상 놀랍지 않습니다. 관객은 <strong>이야기와 감정</strong>을 원합니다. 여러 클립을 엮은 단편, 이어지는 시리즈, 세계관이 있는 콘텐츠가 주목받습니다. 단발 스펙터클보다 <strong>지속되는 서사</strong>의 시대입니다.</p>

<h3>3. 일관성이 실력의 척도가 되다</h3>
<p>같은 캐릭터를 여러 장면에서 유지하고, 톤과 색을 일관되게 묶는 능력 — 이 <a href="?info=magazine&article=consistent-character">일관성 관리</a>가 아마추어와 프로를 가르는 새 기준이 됐습니다. 한 컷의 화려함보다 열 컷의 통일감이 더 어렵고 더 값집니다.</p>

<h3>4. '진짜보다 진짜 같은'의 역설</h3>
<p>기술이 극사실에 가까워질수록, 역으로 <strong>의도적 스타일</strong>(애니메이션풍, 추상, 특정 화가의 톤)이 개성으로 주목받습니다. 모두가 실사를 할 수 있게 되면, 차별점은 '무엇을 실사로 만드느냐'가 아니라 '어떤 세계관을 갖느냐'가 됩니다.</p>

<h3>5. 창작과 유통의 결합</h3>
<p>만드는 것만큼 <strong>어디서 가치를 인정받느냐</strong>가 중요해지고 있습니다. AI 영상 전용 무대, 큐레이션, 라이선스 거래 같은 인프라가 자리를 잡아가는 중입니다. 창작자에게는 좋은 소식입니다 — 만든 것을 값으로 바꿀 길이 넓어지고 있으니까요. (관련: <a href="?info=magazine&article=creaite-is-your-distributor">1인 감독의 배급사</a>)</p>

<h3>변하지 않는 것</h3>
<p>도구는 계속 바뀌겠지만, 하나는 변하지 않습니다. <strong>사람의 마음을 움직이는 이야기</strong>는 언제나 통합니다. 최신 도구를 좇는 것보다, 무엇을 말하고 싶은지가 결국 창작자를 남깁니다. 기술은 거들 뿐입니다.</p>
`,
  },

  {
    slug: "creator-workflow",
    category: "제작기",
    title: "AI 영상 크리에이터의 하루 — 한 편이 나오기까지의 워크플로우",
    excerpt: "아이디어에서 완성본까지, 실제 작업은 어떤 순서로 흘러갈까요? 한 편을 만드는 현실적인 작업 흐름을 공개합니다.",
    date: "2026-06-16",
    readMinutes: 6,
    emoji: "🗂️",
    gradient: "from-[#6366f1] to-[#8b5cf6]",
    body: `
<p>AI 영상은 "버튼 한 번에 뚝딱"이라는 오해가 있습니다. 실제로는 여러 단계의 손길이 들어갑니다. 하지만 흐름을 알면 막막함이 사라집니다. 한 편이 나오기까지의 현실적인 워크플로우를 순서대로 풀어 봅니다.</p>

<h3>① 발상 (10분) — 메모에서 시작</h3>
<p>거창한 기획서는 없습니다. 스치는 이미지·문장 하나를 메모합니다. "빗속의 종이비행기", "마지막 교신" 같은 <strong>씨앗 한 줄</strong>이면 충분합니다. 이 단계의 핵심은 완벽함이 아니라 <strong>착수</strong>입니다.</p>

<h3>② 씬 설계 (20분) — 순간을 나열</h3>
<p>씨앗을 3~8개의 장면으로 쪼갭니다. 각 장면을 한 줄로 적어 흐름(도입→전개→절정)을 잡습니다. 이때 <a href="?info=magazine&article=power-of-series">시리즈로 갈지</a>도 정합니다.</p>

<h3>③ 생성 (가장 오래 — 반복의 시간)</h3>
<p>각 장면을 <a href="?info=magazine&article=ai-video-prompt-formula">프롬프트 5요소</a>로 만듭니다. 여기가 진짜 시간이 드는 곳입니다. 한 컷에 마음에 드는 결과가 나올 때까지 <strong>3~10번씩 다시 생성</strong>하는 게 보통입니다. 좌절하지 마세요 — 프로도 그렇게 합니다.</p>

<h3>④ 선별 (10분) — 버리는 용기</h3>
<p>생성한 것 중 <strong>가장 좋은 것만</strong> 남깁니다. 아까워도 흐름에 안 맞는 컷은 버립니다. 편집은 '더하기'가 아니라 '빼기'입니다.</p>

<h3>⑤ 합성·편집 (30분) — 한 편으로 묶기</h3>
<p>클립을 순서대로 잇고, 크로스페이드·페이드로 다듬고, <a href="?info=magazine&article=color-grading-cinematic">색보정</a>으로 톤을 통일하고, <a href="?info=magazine&article=ai-video-music-sound">음악</a>을 깝니다. 이 단계에서 '조각들'이 '작품'이 됩니다.</p>

<h3>⑥ 포장 (10분) — 제목·썸네일</h3>
<p>완성이 끝이 아닙니다. <a href="?info=magazine&article=title-that-clicks">제목</a>과 <a href="?info=magazine&article=ai-video-thumbnail-guide">썸네일</a>을 정성껏 고릅니다. 이 10분이 조회수를 몇 배로 바꿉니다.</p>

<h3>⑦ 발행 (5분) — 세상에 내보내기</h3>
<p><a href="?tab=upload">CREAITE에 업로드</a>하고, 장르·등급·가격을 설정합니다. 그리고 다음 아이디어를 메모하며 하루를 마칩니다.</p>

<h3>완벽한 하루는 없다</h3>
<p>모든 단계가 매번 매끄럽지는 않습니다. 어떤 날은 생성이 안 풀리고, 어떤 날은 편집이 막힙니다. 중요한 건 <strong>흐름을 알고 계속 굴리는 것</strong>입니다. 이 루틴을 반복할수록 각 단계가 빨라지고, 결과물이 좋아집니다.</p>
`,
  },

  {
    slug: "collab-filmmaking",
    category: "인사이트",
    title: "혼자 말고 같이 — AI 시대의 공동 영화 만들기",
    excerpt: "AI가 1인 제작을 가능하게 했지만, 함께 만들면 더 멀리 갑니다. 협업이 AI 영상 창작에서 갖는 새로운 의미.",
    date: "2026-06-14",
    readMinutes: 5,
    emoji: "🤝",
    gradient: "from-[#10b981] to-[#8b5cf6]",
    body: `
<p>AI 영상의 매력 중 하나는 '혼자서도 한 편을 만들 수 있다'는 점입니다. 그런데 역설적이게도, AI 시대에 <strong>협업</strong>은 오히려 더 흥미로운 가능성이 됩니다. 왜일까요?</p>

<h3>혼자의 한계, 함께의 확장</h3>
<p>1인 창작은 빠르고 자유롭지만, 결국 <strong>한 사람의 취향과 역량</strong> 안에 갇힙니다. 반면 여럿이 모이면 서로의 강점이 합쳐집니다. 누군가는 프롬프트에 강하고, 누군가는 편집에 능하고, 누군가는 이야기를 잘 짭니다. AI가 제작의 물리적 장벽을 없앴기 때문에, 이제 협업은 '분업'이 아니라 '증폭'이 됩니다.</p>

<h3>1. 릴레이 방식 — 한 사람이 한 장면씩</h3>
<p>가장 재미있는 실험입니다. 한 명이 1번 장면을 만들면, 다음 사람이 그 흐름을 이어 2번 장면을 만듭니다. 누구도 결말을 모른 채 이어지는 <strong>즉흥 영화</strong> — 예상 못 한 전개가 매력입니다.</p>

<h3>2. 역할 분담 — 감독·생성·편집·음악</h3>
<p>전통 영화 제작처럼 역할을 나눕니다. 기획하는 사람, 클립을 뽑는 사람, 편집하는 사람. 각자 잘하는 데 집중하면 혼자서는 못 낼 완성도가 나옵니다.</p>

<h3>3. 세계관 공유 — 같은 무대, 다른 이야기</h3>
<p>여러 창작자가 <strong>하나의 세계관</strong>을 공유하고 각자의 에피소드를 만드는 방식입니다. 마블의 유니버스처럼, 개별 작품이 모여 더 큰 이야기를 이룹니다.</p>

<h3>협업이 만드는 것 — 작품 그 이상</h3>
<p>함께 만들면 결과물만 나오는 게 아닙니다. <strong>피드백, 자극, 그리고 지속할 동력</strong>이 생깁니다. 혼자 하면 지치는 창작을, 동료가 있으면 오래 즐길 수 있습니다. CREAITE의 커뮤니티·협업 공간이 존재하는 이유이기도 합니다.</p>

<p>AI는 '혼자서도 가능하게' 만들었지만, 창작의 즐거움은 여전히 '함께할 때' 배가됩니다. 다음 작품은 혼자 끙끙대지 말고, 누군가와 함께 시작해 보세요.</p>
`,
  },

  {
    slug: "salvage-failed-clips",
    category: "가이드",
    title: "망한 클립 되살리기 — 실패한 생성물 활용법",
    excerpt: "생성한 클립이 마음에 안 든다고 다 버리나요? 실패작을 작품으로 바꾸는 편집자의 시선을 소개합니다.",
    date: "2026-06-12",
    readMinutes: 5,
    emoji: "🩹",
    gradient: "from-[#ef4444] to-[#f59e0b]",
    body: `
<p>AI로 영상을 만들다 보면 '망한 클립'이 산더미처럼 쌓입니다. 손이 여섯 개인 인물, 갑자기 뒤틀리는 배경, 어색한 움직임. 하지만 노련한 편집자는 그 실패작에서 <strong>쓸 만한 3초</strong>를 건집니다. 버리기 전에 시도해 볼 것들입니다.</p>

<h3>1. 전체가 아니라 '순간'을 본다</h3>
<p>15초 클립이 통째로 망했어도, 그 안의 <strong>2~3초는 멀쩡한</strong> 경우가 많습니다. 이상해지기 직전까지만 잘라 쓰세요. 짧게 끊고 다음 컷으로 넘기면 결함이 안 보입니다. <strong>짧은 컷의 연속</strong>이 긴 한 컷보다 실수를 잘 숨깁니다.</p>

<h3>2. 속도로 가린다</h3>
<p>어색한 움직임은 <strong>재생 속도</strong>로 위장할 수 있습니다. 살짝 빠르게 하면 뭉개져서 결함이 덜 보이고, 슬로모션으로 하면 오히려 스타일이 됩니다. 속도는 편집의 마법 지팡이입니다.</p>

<h3>3. 크롭·확대로 결함을 잘라낸다</h3>
<p>화면 한쪽 구석이 망가졌다면, <strong>그 부분을 잘라내고 확대</strong>하면 됩니다. 인물의 얼굴이 이상하면 손이나 발, 배경으로 프레임을 옮기는 것도 방법입니다. 관객에게 안 보여주면 없는 것과 같습니다.</p>

<h3>4. 어둠·연기·효과로 덮는다</h3>
<p>결함 위에 <strong>그림자, 안개, 렌즈 플레어, 파티클</strong>을 얹으면 자연스럽게 가려집니다. 공포·미스터리 장르에서는 오히려 이런 '보일 듯 말 듯'이 분위기를 살립니다. 약점을 콘셉트로 바꾸는 겁니다.</p>

<h3>5. 컷어웨이로 시선을 돌린다</h3>
<p>이상한 장면 중간에 <strong>다른 컷(디테일 샷, 반응 샷)</strong>을 끼워 넣으면 관객의 시선이 분산돼 결함을 놓칩니다. 편집의 오래된 기술이 AI 시대에도 그대로 통합니다.</p>

<h3>실패는 재료다</h3>
<p>완벽한 클립만 쓰려 하면 영영 완성 못 합니다. 프로의 결과물도 알고 보면 <strong>불완전한 조각들을 영리하게 엮은 것</strong>입니다. 실패작 폴더를 지우지 말고, 편집자의 눈으로 다시 보세요. 거기 쓸 만한 3초가 숨어 있습니다.</p>
`,
  },

  {
    slug: "find-your-style",
    category: "인사이트",
    title: "나만의 스타일 찾기 — AI 시대에 '알아보게' 되는 법",
    excerpt: "누구나 좋은 영상을 만드는 시대, 결국 남는 건 '당신다움'입니다. 자기만의 시그니처를 만드는 방법.",
    date: "2026-06-10",
    readMinutes: 5,
    emoji: "🎭",
    gradient: "from-[#ec4899] to-[#6366f1]",
    body: `
<p>AI가 제작의 문턱을 없애면서 역설이 생겼습니다. 누구나 멋진 영상을 만들 수 있게 되자, <strong>비슷비슷한 결과물</strong>이 넘쳐나게 된 것입니다. 이런 시대에 살아남는 창작자의 공통점은 하나입니다. <strong>'알아볼 수 있는 스타일'</strong>이 있다는 것.</p>

<h3>스타일은 '제약'에서 나온다</h3>
<p>역설적이지만, 모든 걸 할 수 있을 때 개성은 사라집니다. 스타일은 <strong>의도적인 제약</strong>에서 태어납니다. "나는 항상 이 색감으로", "나는 늘 이런 카메라 움직임으로", "나는 이 주제만" — 스스로 좁힐수록 목소리가 또렷해집니다.</p>

<h3>1. 반복하는 시각 요소를 정한다</h3>
<p>특정 색 팔레트, 특정 화면비, 특정 전환 방식. <strong>매 작품에 반복되는 시각 서명</strong> 하나를 정하세요. 관객은 그 반복을 통해 당신을 기억합니다. 로고보다 강력한 게 일관된 룩입니다.</p>

<h3>2. 다루는 '감정의 결'을 좁힌다</h3>
<p>모든 감정을 다 다루려 하지 마세요. "나는 쓸쓸함을 그린다", "나는 벅찬 순간을 담는다" — <strong>당신만의 정서적 영역</strong>이 생기면, 사람들은 특정 기분을 원할 때 당신을 찾습니다.</p>

<h3>3. 완벽을 흉내 내지 말고 취향을 드러낸다</h3>
<p>기술적으로 완벽한 영상은 이제 흔합니다. 오히려 <strong>당신의 취향·관점이 묻어나는</strong> 불완전함이 개성이 됩니다. 남들처럼 잘하는 것보다, 당신답게 하는 게 오래 남습니다.</p>

<h3>4. 스타일은 발견하는 것 — 만들려 하지 말 것</h3>
<p>"오늘부터 내 스타일은 이거다"라고 선언한다고 생기지 않습니다. 스타일은 <strong>많이 만들다 보면 저절로 배어 나오는 것</strong>입니다. 열 편, 스무 편을 만들다 보면 반복되는 나의 습관·선호가 보입니다. 그것을 알아채고 밀어붙이면 시그니처가 됩니다.</p>

<h3>당신다움이 마지막 경쟁력</h3>
<p>도구는 평준화되고, 기술은 따라잡힙니다. 하지만 <strong>'당신의 시선'은 복제되지 않습니다.</strong> 무엇을 아름답다 여기는지, 무엇에 마음이 움직이는지 — 그 고유함이 결국 창작자를 남깁니다. 최신 기법을 좇기 전에, 당신이 무엇을 말하고 싶은지를 먼저 물어보세요.</p>
`,
  },
];

// 영문 번역 (slug → {title, excerpt, body}). 본문 HTML 구조·href 는 한글본과 동일.
// 미등록 slug 는 자동으로 한글 폴백된다.
const ARTICLES_EN: Record<string, { title: string; excerpt: string; body: string }> = {
  "creaite-is-your-distributor": {
    "title": "You Made an AI Film. Let CREAITE Be Your Distributor.",
    "excerpt": "You spent nights refining prompts, regenerating dozens of times, stitching clips together and matching their color. The film you finally finished — now there's a 'distributor' ready to release it to the world.",
    "body": "\n<p>Anyone who has ever made a film knows the feeling. The rush when it's finally done — and the emptiness that follows right after. <strong>\"So… where do I put this now?\"</strong></p>\n\n<p>You put in the hours. You rewrote your prompts dozens of times trying to turn the scene in your head into words, regenerating over and over until a shot finally felt right. You threaded eight clips into a single emotional line, matched the color, and fine-tuned the pacing. AI handed you the tools — but it was <strong>your eye and your persistence that turned those tools into a 'work'</strong>.</p>\n\n<p>And yet, a film finished that way usually has nowhere to go.</p>\n\n<h3>The barrier to making it vanished. The barrier to releasing it stayed.</h3>\n<p>AI tore down the wall of 'production'. Now a single person at a laptop can create a fighter jet in a storm or a whale in the deep sea. But <strong>the wall of 'distribution' remained standing.</strong></p>\n<p>Upload it to a general-purpose video platform and your cinematic short gets buried between dog videos and game clips. The algorithm doesn't distinguish 'works' from 'content', and after a handful of views it's forgotten. The hard-won film had <strong>no stage where its value could be recognized</strong>.</p>\n\n<p>Traditionally, the one who built that 'stage' was the <strong>distributor</strong>. A director makes the work, and the distributor puts it in theaters, introduces it to audiences, and turns it into revenue. The problem was that distributors were a handful of giant companies, and not just anyone could knock on their door.</p>\n\n<h3>What CREAITE sets out to do: a distributor for the solo director</h3>\n<p>So CREAITE defines itself this way: <strong>\"the distributor for the age of the solo director.\"</strong> If you're the director, we're the distribution partner that carries your work out into the world. Concretely, here's what we do.</p>\n\n<h3>① We give you a stage — curated cinema & OTT</h3>\n<p>Your film isn't thrown into a view-count race. It's placed in <strong>curated cinema & OTT sections</strong> matched to its genre and time slot. Action shown as action, immersive features in the night lineup — it meets its audience as a 'work'.</p>\n\n<h3>② We give you ways to put a price on it — three revenue streams</h3>\n<p>Good work deserves recognition. On CREAITE, your film earns recognition in <strong>three ways</strong>.</p>\n<ul>\n<li><strong>License sales</strong> — well-made videos sell as source material to other creators and ad producers. A work made once pays off many times over.</li>\n<li><strong>Subscription revenue share</strong> — premium subscription fees are distributed in proportion to watch time. The more steadily a work is loved, the bigger its share.</li>\n<li><strong>Ad revenue</strong> — being watched by many people is itself revenue.</li>\n</ul>\n<p>You can find the full structure in the <a href=\"?info=creator-revenue\">Creator Revenue Policy</a>.</p>\n\n<h3>③ We protect the creator's name — transparent proof of production</h3>\n<p>A distributor safeguards the creator's rights on their behalf. CREAITE preserves <strong>production details</strong> alongside the video — its prompt, seed, and the models used — to transparently prove how the work was made. It shields you from plagiarism disputes and gives buyers confidence. (More: <a href=\"?info=magazine&article=ai-video-copyright-license\">AI Video Copyright & Licensing, Fully Explained</a>)</p>\n\n<h3>Value that stays hidden never gets recognized</h3>\n<p>There are already wonderful AI films sitting quietly buried — inside their makers' hard drives, or beneath the sea of the algorithm. We want those works to <strong>rise onto the stage and be valued</strong>.</p>\n\n<p>That film you built with your time and care — now it has somewhere to go. <a href=\"?tab=upload\">Upload it to CREAITE</a>, meet an audience, and let it be valued. The camera is already in your hands. The distributor is right here.</p>\n\n<p class=\"text-white/50 text-sm\">— CREAITE. The distributor for an age when everyone is a director.</p>\n"
  },
  "ai-video-prompt-formula": {
    "title": "Write Your AI Video Prompts Like This and the Results Change — The 5-Element Formula",
    "excerpt": "With the same AI tool, one person ends up with a flat clip and another with a cinematic scene. The difference is almost always in the prompt. Here are five elements proven in practice.",
    "body": "\n<p>AI video generation tools have advanced explosively over the past year or two. Tools like Seedance, Higgsfield, and Sora turn a single line of text or a single image into seconds of video. And yet when you actually try them, something feels off. Same tool, supposedly — but one person's output looks like an ad and another's looks like a rough draft. Eight times out of ten, that difference is decided by the <strong>prompt (the instruction)</strong>.</p>\n\n<p>Analyze the high-quality videos uploaded to CREAITE and you'll find a shared structure in their prompts. We call it the <strong>5-Element Formula</strong>. Let's take it apart, one piece at a time.</p>\n\n<h3>1. Look — the overall mood and image quality</h3>\n<p>The first thing to decide is \"what kind of feel does this video have?\" Words like <em>cinematic, photorealistic, hyper-realistic, dramatic lighting, desaturated palette</em> belong here. Leave the look unspecified and the AI defaults to the average — a \"so-so stock footage\" kind of result.</p>\n\n<h3>2. The action of the subject or character</h3>\n<p>Don't forget this is a <strong>video</strong>, not a still image. Not \"a man looks out the window\" but \"a man slowly turns his head to gaze out the window as raindrops slide down the glass\" — you have to <strong>describe the movement</strong>. The more specific the action, the more naturally the frames connect to one another.</p>\n\n<h3>3. Setting — the background and space</h3>\n<p>Where is this happening? Spell out the time of day (dawn / dusk / midday), the place (canyon / neon city / stratosphere), and the weather (storm / fog). The setting isn't just a backdrop — it's <strong>half the emotion</strong>. The same character becomes a completely different story inside a storm cloud versus above an orbit at sunrise.</p>\n\n<h3>4. Effect</h3>\n<p>Visual effects like lens flare, slow motion, smoke, sparks, and depth of field. Overdo it and it looks tacky, but one or two precise effects erase the \"made-by-AI\" tell and lift the production quality.</p>\n\n<h3>5. ★ Camera movement + speed (the most frequently omitted element)</h3>\n<p>Here lies the decisive difference between beginners and pros. Most people write only \"what to shoot\" and never \"how the camera moves.\" <strong>slow tracking shot, dolly in, orbit, low-angle, handheld</strong> — add the <em>speed (slowly, rapidly)</em> on top, and the video instantly looks \"filmed.\"</p>\n\n<p>Let's compare with a real example.</p>\n<ul>\n<li><strong>Weak prompt:</strong> \"a paper airplane in a rainy city\"</li>\n<li><strong>Strong prompt:</strong> \"a rainy neon city, a paper airplane passing above a figure holding an umbrella, followed with a slow tracking shot, reflected neon, cinematic color grade, 35mm lens depth of field\"</li>\n</ul>\n\n<p>The second prompt holds the look (cinematic color grade), the action (passing), the setting (neon city, rain), the effect (reflections, depth of field), and camera movement + speed (slow tracking shot) — all of it. Make both yourself and the difference in the result is overwhelming.</p>\n\n<h3>In summary</h3>\n<p>A prompt isn't a magic spell — it's a <strong>directing brief</strong>. Just as a director tells the cinematographer \"shoot it like this,\" pack the five elements (look, action, setting, effect, ★ camera movement + speed) into a single sentence. Element 5, camera movement, is the one you must never leave out. That single line is what separates a sketch from a work.</p>\n\n<p>Once your video is finished, <a href=\"?tab=upload\">upload it to CREAITE</a> to sell it as a license, or let it meet an audience in the cinema & OTT sections.</p>\n"
  },
  "making-of-paper-wings": {
    "title": "The Journey of a Single Paper Airplane — The Making of the AI Short 'The Lightest Flight'",
    "excerpt": "From a paper airplane on a desk, through storms, canyons, and a neon city, all the way to space. Here's how eight clips were woven into a single story.",
    "body": "\n<p>What does it actually take to make a film with AI? Using <strong>「The Lightest Flight」</strong>, a two-minute short completed with CREAITE's video production harness, as our example, let's follow the whole flow of how a single piece comes together, from start to finish.</p>\n\n<h3>1. Concept — one object, one journey</h3>\n<p>A good short usually starts from a simple idea. This time the theme was \"the lightest thing flies the highest.\" The protagonist: <strong>a single paper airplane</strong>. It's a metaphor — that one weightless sheet of paper drifting serenely past costly fighter jets and finally reaching space.</p>\n\n<h3>2. Scene breakdown — eight moments</h3>\n<p>We split the two minutes into eight 15-second clips. Each clip is one \"moment.\"</p>\n<ul>\n<li>A paper airplane taking off from a desk, sunlight slanting across it</li>\n<li>Into storm clouds crackling with lightning</li>\n<li>A stealth fighter piercing black smoke, the paper airplane grazing past it</li>\n<li>Gliding through a canyon at dusk</li>\n<li>A neon cyberpunk city, a red-eyed pursuer</li>\n<li>Flying side by side across a still dawn sky</li>\n<li>The stratosphere — high enough to see the curve of the Earth</li>\n<li>Space — above an orbit at sunrise</li>\n</ul>\n<p>What matters is the <strong>connection</strong>. To keep the clips from drifting apart, we ran the paper airplane as an object and the direction of \"up, ever higher\" through every single scene.</p>\n\n<h3>3. Clip generation — from image to video</h3>\n<p>Each scene was generated according to the <a href=\"?info=magazine&article=ai-video-prompt-formula\">5-Element Formula</a> introduced earlier. The canyon scene, for instance, packed in look, action, setting, effect, and camera movement all at once: \"a sandstone canyon at dusk, a paper airplane gliding between the cliffs, low-angle tracking shot, photorealistic, golden-hour lighting.\"</p>\n\n<h3>4. Compositing — clips into one piece</h3>\n<p>The eight clips are stitched together in the harness's compositing stage. What happens here:</p>\n<ul>\n<li><strong>Crossfade transitions</strong> — cuts flow smoothly into one another instead of snapping abruptly.</li>\n<li><strong>Overall fade in / out</strong> — giving the opening and the ending room to breathe.</li>\n<li><strong>Unified format</strong> — normalized to 720p / 30fps so it plays at consistent quality on any device.</li>\n</ul>\n\n<h3>5. Publishing — meeting the audience</h3>\n<p>The finished piece is registered on CREAITE with a title, description, genre, and age rating. 「The Lightest Flight」 was classified as <strong>Film / Sci-Fi / All Ages</strong>. Now anyone can watch it in the cinema & OTT sections.</p>\n\n<h3>What we learned</h3>\n<p>The bottleneck in AI video production is no longer \"generation.\" Tools spit out clips fast enough. The genuinely hard part is <strong>the editing and direction that binds multiple clips into a single emotional line</strong>. A good short comes not from one dazzling shot, but from stitching eight ordinary ones together well.</p>\n"
  },
  "how-creators-earn": {
    "title": "3 Ways AI Video Creators Make Money: Licensing, Subscriptions, and Ads",
    "excerpt": "Making great videos and making money from them are two different problems. Here are the three paths CREAITE creators use to turn their work into income.",
    "body": "\n<p>\"You can make videos with AI now\" is no longer news. The real question comes next: <strong>how do you actually earn from the videos you make?</strong> On CREAITE, there are broadly three paths for a creator to make money. Each has a different character, so it's worth finding the mix that fits your own content.</p>\n\n<h3>1. License sales — selling your video as an 'asset'</h3>\n<p>The most direct approach. A well-made video clip has value as <strong>source material</strong> for other creators, YouTubers, and ad producers. On the CREAITE market, you can set a license price on each video and sell it. The key is that a video made once can be sold many times.</p>\n<p>Pricing is flexible. It runs from small single-purchase sales to high-value works negotiated directly with the buyer on a 'by arrangement' basis. Note that very short videos have limited use as source material, so their sales may be restricted.</p>\n\n<h3>2. Subscription revenue share — divided by watch time</h3>\n<p>CREAITE runs an OTT-style premium subscription. The revenue pooled from subscription fees is distributed <strong>in proportion to creators' watch time</strong>. In other words, the longer and more often your work is played, the bigger the share you draw from the subscription pool.</p>\n<p>The strength of this model is the <strong>long tail</strong>. Even without a single smash hit, several works watched steadily add up into a stable source of income. The structure favors long-form, immersive content.</p>\n\n<h3>3. Ad revenue — exposure is revenue</h3>\n<p>Videos released for free can carry ads, and revenue is generated from that exposure. Even without a 'sale' happening the way it does with licensing, <strong>being watched by many people</strong> is itself revenue. With a low barrier to entry, it's a great path for beginner creators to experience their first earnings.</p>\n\n<h3>How to combine the three</h3>\n<p>The right answer depends on the character of your content.</p>\n<ul>\n<li><strong>High-quality source clips</strong> (stunning scenery, action shots) → centered on license sales</li>\n<li><strong>Immersive long-form and series</strong> → centered on subscription revenue share</li>\n<li><strong>Light, viral short-form</strong> → centered on ad exposure</li>\n</ul>\n<p>Most creators blend all three — gathering fans with free short-form, then converting some of them into licensing and subscriptions.</p>\n\n<p>You can find the specific distribution ratios and settlement criteria on the <a href=\"?info=creator-revenue\">Creator Revenue Policy</a> page. What matters is this: now that AI has dramatically lowered production costs, <strong>your edge is no longer \"can you make it\" but \"how do you monetize it\"</strong>.</p>\n"
  },
  "genre-directing-guide": {
    "title": "Genre Sets the Mood — A Directing Guide for Every AI Video Genre",
    "excerpt": "Sci-fi, action, romance, horror… even with the same subject, knowing the genre's codes changes the result completely. Here are the key directing points for each of the major genres.",
    "body": "\n<p>Audiences sense \"what genre is this?\" within the first three seconds. Color, lighting, camera movement, pacing — this visual language is what defines a genre. AI video is no different. Bake the genre codes into your prompt and you'll get far more convincing results. Let's walk through the directing points for each of CREAITE's signature genres.</p>\n\n<h3>Sci-Fi — Scale and Coldness</h3>\n<p>The heart of sci-fi is a <strong>sense of scale</strong> and <strong>cold color temperature</strong>. Use wide skies, massive structures, and place figures small in the frame to emphasize the size of the world. Keep the palette cold, leaning into blues and cyans. The camera moves big and slow (a sweeping wide shot, a slow orbit). Artificial light sources like neon and holograms make great accents.</p>\n\n<h3>Action — Speed and Weight</h3>\n<p>In action, <strong>the camera's speed</strong> is the direction itself. Handheld shake, fast tracking, the intimidation of a low-angle looking up. Add effects like dust, sparks, and debris to give each hit its \"weight.\" Use slow motion just once, at the decisive moment, and the emphasis lands hard.</p>\n\n<h3>Romance — Soft Light and Shallow Depth</h3>\n<p>Romance runs on <strong>warm golden-hour lighting</strong> and <strong>shallow depth of field</strong> (a blurred background). Keep the focus on the figures and let the background melt softly away to create intimacy. Move the camera slowly, as if wrapping around the subject (a gentle push-in). Pastel, warm-toned color grading brings out the emotion.</p>\n\n<h3>Horror — Darkness, Silence, and Restraint</h3>\n<p>The power of horror lies not in what you show but in <strong>what you withhold</strong>. Deep shadows, darkness filling most of the frame, an uneasy silence. Let the camera creep forward slowly (a slow creeping dolly), hiding the subject until the decisive moment. Cold, desaturated color amplifies the dread.</p>\n\n<h3>Nature & Landscape — The Flow of Time and Light</h3>\n<p>This is a relatively recent addition to CREAITE. Here, <strong>mood matters more than drama</strong>. Capture nature's rhythms — waves, mist, drifting clouds — and keep camera movement to a minimum. It's an especially good fit for ambient content you leave playing in the background.</p>\n\n<h3>Abstract — Experiments That Break the Rules</h3>\n<p>Abstract isn't about narrative; it's about <strong>texture and motion</strong> themselves. Flowing forms, refracted light, repeating patterns. Because there's no right answer, it's the space where the most experimental results emerge. It pairs well with immersive time slots like dawn and late night.</p>\n\n<h3>Genre Is a Shortcut, Not a Constraint</h3>\n<p>Knowing a genre's codes means speaking a language you already share with the audience. You have to know the rules before you can bend them on purpose. Make one piece by the genre's grammar first, and once it feels natural, start trying your own variations. CREAITE sorts content into 11 genres, so it's a smart strategy to think about which corner your work will meet its audience in as you create.</p>\n"
  },
  "what-is-ai-cinema-ott": {
    "title": "What Is an AI Cinema OTT? — A New Category Between Netflix and YouTube",
    "excerpt": "An age when anyone can be a director. What CREAITE is building isn't a streaming service or a video platform — it's something in between.",
    "body": "\n<p>For a long time, the video industry has had two poles. On one side, premium streaming, epitomized by <strong>Netflix</strong> — a few professionals make high-quality work that the many consume. On the other, open platforms, epitomized by <strong>YouTube</strong> — anyone uploads, anyone watches. But AI video generation is shaking up this arrangement.</p>\n\n<h3>When Production Cost Approaches Zero</h3>\n<p>\"Cinematic\" video used to sit behind walls of equipment, crew, and budget. Cameras, lighting, actors, locations, post-production — barriers an amateur could hardly clear. AI video tools have lowered those walls dramatically. Now a single person at a laptop can conjure a fighter jet in a storm, a whale in the deep sea, or a paper airplane in the stratosphere.</p>\n<p>The result is something strange. You can now make <strong>Netflix-caliber visuals with YouTube-level accessibility</strong>. An empty space has opened up between the two old poles.</p>\n\n<h3>The Space CREAITE Is Filling</h3>\n<p>CREAITE defines that empty space as an <strong>\"AI Cinema OTT + Creator License Market.\"</strong> Three things live in one place.</p>\n<ul>\n<li><strong>A place to watch (OTT / cinema):</strong> Enjoy AI-made cinematic videos, curated by genre and time of day.</li>\n<li><strong>A place to create (upload / harness):</strong> Anyone can post their work and meet an audience.</li>\n<li><strong>A place to trade (license market):</strong> Buy and sell videos as source material, so creators earn.</li>\n</ul>\n\n<h3>Not \"Pulled-In\" Video, but \"Made\" Video</h3>\n<p>There's an important distinction. CREAITE isn't a service that aggregates video from elsewhere to show you. It's a place where <strong>original videos newly created with AI</strong> are uploaded, meet audiences, and get traded. It's an attempt to hold the full cycle of creation, distribution, and revenue — fit for the generative-AI era — inside a single platform.</p>\n\n<h3>Still Just the Beginning</h3>\n<p>This category is only just opening up. That the answers aren't fixed yet means there's a <strong>first-mover opportunity</strong> for creators who jump in now. Now that AI has removed the barrier of the tools, the remaining edge is \"what you say, and how you say it.\" The camera is already in everyone's hands.</p>\n"
  },
  "ai-video-copyright-license": {
    "title": "Who Owns the Copyright to an AI-Made Video? — The Complete Licensing Guide",
    "excerpt": "The rights around AI-generated work still feel unfamiliar. Here are the basics every creator should know, plus how to buy and sell video safely on CREAITE.",
    "body": "\n<p>Make videos with AI long enough and a question naturally arises. <strong>\"This video — is it really mine?\"</strong> And, \"Am I allowed to sell it?\" The rights landscape for AI-generated work is still evolving, but here are the basic principles and practical tips worth knowing as a creator.</p>\n\n<p class=\"text-white/50 text-sm\">* This article is intended to aid general understanding and is not legal advice. For specific matters, consult a professional.</p>\n\n<h3>1. Rights to AI-Generated Work: The Core Principle</h3>\n<p>Most AI video tools, in their terms of service, <strong>grant users the commercial use of generated output</strong> (this varies by subscription tier and service, so always check). In other words, a video you made by entering a prompt can, in many cases, be used and sold by you within the bounds that tool's terms allow.</p>\n<p>There's one caveat, though. <strong>Output that imitates someone else's copyrighted work, trademark, or likeness</strong> is a separate matter. A video that reproduces a real person's face, a specific brand logo, or an existing film or character can invite disputes — even if it was made with AI.</p>\n\n<h3>2. What CREAITE Prohibits</h3>\n<p>For the sake of a healthy market, CREAITE clearly prohibits the following.</p>\n<ul>\n<li>Deepfake-style content that infringes a real person's likeness or right of publicity</li>\n<li>AI-generated work that imitates someone else's trademark or copyrighted material without permission</li>\n<li>Selling licenses to content whose rights cannot be guaranteed</li>\n</ul>\n<p>When uploading, creators warrant that they hold the rights to the video and that it does not infringe any third party's rights. We also operate a notice-and-takedown process.</p>\n\n<h3>3. What It Means to \"Sell\" a License</h3>\n<p>Selling a video on the CREAITE market doesn't mean handing over the copyright itself — it means <strong>granting a right of use (a license)</strong>. The seller remains the original author, while the buyer gains the right to use that video within the agreed scope.</p>\n\n<h3>4. Proof of AI Production — Transparency Builds Trust</h3>\n<p>CREAITE is designed to <strong>display production details</strong> alongside the video, such as the prompt, seed, and model used. Being transparent about \"how this video was made\" reduces plagiarism disputes and gives buyers confidence. In the age of AI creation, transparency is both a defense and a competitive edge.</p>\n\n<h3>5. A Practical Checklist for Creators</h3>\n<ul>\n<li>Have you checked the <strong>scope of commercial use and resale permitted</strong> in your AI tool's terms?</li>\n<li>Does the output avoid unauthorized inclusion of real people, brands, or existing IP?</li>\n<li>When selling, did you clearly state the license scope (personal / commercial)?</li>\n<li>Did you disclose the production details transparently?</li>\n</ul>\n\n<p>Content with clean rights sells for more, and for longer. For the full terms, see the <a href=\"?info=terms\">Terms of Service</a>. Now that the barrier to creating has fallen, <strong>creating while respecting rights</strong> becomes the bigger asset over the long run.</p>\n"
  },
  "first-ai-short-5-steps": {
    "title": "Your First AI Short — 5 Steps for Beginners",
    "excerpt": "Not sure where to even begin with AI video? Here are the five steps, in order, to get you all the way to a finished first short.",
    "body": "\n<p>Open an AI video tool for the first time and everyone hits the same wall. \"What do I make?\" And, \"How do I even start?\" Seeing all the dazzling results out there can be discouraging. But a first short is simpler than you think. These five steps are all you need.</p>\n\n<h3>Step 1 — Nail the Concept in One Sentence</h3>\n<p>It doesn't need to be grand. An <strong>idea that boils down to a single sentence</strong> — like \"the lightest thing flies the highest\" — is enough. Good shorts come not from a complicated plot but from one vivid emotion or metaphor. If it's your first, a theme conveyed <strong>through visuals alone</strong>, with no dialogue, is far easier.</p>\n\n<h3>Step 2 — Break It Into 3–8 \"Moments\"</h3>\n<p>Don't try to make a whole two-minute film in one go. Split it into <strong>several short scenes of around 15 seconds each</strong>. Each scene is a single \"moment.\" Just laying out a flow of beginning (setup) → development (change) → climax (arrival) already makes it a story.</p>\n\n<h3>Step 3 — Generate Each Scene With the 5 Prompt Elements</h3>\n<p>Build each scene around the <a href=\"?info=magazine&article=ai-video-prompt-formula\">5 prompt elements</a> (look, action, background, effects, camera movement + speed). Be sure to include the <strong>camera movement</strong> especially. It's fine if you don't get a perfect cut on the first try. Regenerating a few times until you're happy is completely normal.</p>\n\n<h3>Step 4 — Stitch It Together</h3>\n<p>Join the clips in order. Just a <strong>crossfade</strong> to move smoothly from cut to cut, plus a <strong>fade in/out</strong> at the start and end, will noticeably raise the polish. Lay a single track of music underneath and several clips bind together into one work.</p>\n\n<h3>Step 5 — Publish It, and Get Feedback</h3>\n<p>The most important final step. <strong>Once it's done, send it out into the world.</strong> A video sitting on your hard drive never grows. <a href=\"?tab=upload\">Upload it to CREAITE</a>, watch how the audience reacts, and fold that into your next piece. Your first one can be clumsy. The second and third get better fast.</p>\n\n<h3>Finished Beats Perfect</h3>\n<p>The trap beginners fall into most often is <strong>never publishing because \"it needs more polish.\"</strong> The goal of a first short isn't a masterpiece — it's <strong>finishing</strong>. The experience of seeing one piece through to the end is worth more than ten ideas.</p>\n"
  },
  "where-to-upload-ai-video": {
    "title": "Where Should You Upload Your AI Video — General Platforms vs. a Specialized Stage",
    "excerpt": "Upload the AI film you worked so hard on to just any platform and it gets buried. Here's why your choice of platform can decide a work's fate, and how to make it.",
    "body": "\n<p>Once your video is finished, one last decision remains: <strong>\"Where do I post it?\"</strong> This choice matters more than you might think. Even the same work can find a completely different audience, reception, and revenue depending on the stage it stands on.</p>\n\n<h3>The Pros and Cons of General Video Platforms</h3>\n<p>Massive general-purpose platforms offer enormous <strong>reach</strong>. In theory, hundreds of millions of people could see your work. But that also means limitless competition, and the algorithm isn't looking at artistry — it's looking at watch time and click-through rate. A cinematic short gets measured by the same yardstick as vlogs and gaming clips, and usually gets buried. On top of that, there's no <strong>marketplace for creative work</strong> such as licensing sales.</p>\n\n<h3>The Value of a Specialized Stage</h3>\n<p>A platform built for a specific field, on the other hand, has narrower reach but comes with <strong>context</strong>. Presenting AI cinema to an audience that came specifically to watch AI cinema — this \"alignment of context\" is what lets your work's value shine. That's even more true when there's curation, genre categorization, a community of fellow creators, and <strong>a structure for buying and selling work</strong>.</p>\n\n<h3>A Checklist for Choosing</h3>\n<p>If you're unsure where to post, ask yourself these questions.</p>\n<ul>\n<li>Is this platform's audience <strong>made up of people who came to watch my genre?</strong></li>\n<li>Is my work treated as a <strong>\"work of art\" rather than just \"content\"?</strong></li>\n<li>Beyond view counts, is there a <strong>path to monetization</strong> (licensing, subscriptions, ads)?</li>\n<li>Are the creator's <strong>rights and proof of authorship</strong> protected?</li>\n</ul>\n\n<h3>The Right Answer Might Be \"Both\"</h3>\n<p>Of course, you don't have to pick just one. A parallel strategy works well too: use general platforms to <strong>spread the word widely</strong>, and a specialized stage to <strong>have your work recognized and traded for its value</strong>. The key is to avoid \"posting it anywhere and forgetting about it.\" Your work is too good to be consumed carelessly. That's exactly why CREAITE positions itself as <a href=\"?info=magazine&article=creaite-is-your-distributor\">the distributor for the solo director</a>.</p>\n"
  },
  "ai-video-thumbnail-guide": {
    "title": "The Thumbnail Is Half the Battle — How to Craft an AI Video's First Impression",
    "excerpt": "Your audience judges before they ever hit play. Here are five principles for a thumbnail that earns the click.",
    "body": "\n<p>No matter how well a film is made, if no one hits the play button, it may as well not exist. The thing that gets them to press that button is the <strong>thumbnail</strong>. In the half-second it takes to scroll past a listing, viewers decide whether to click based on the thumbnail alone. Let's look at the principles of a great one.</p>\n\n<h3>1. Choose a Single \"Decisive Moment\"</h3>\n<p>Don't try to summarize the entire video. The most <strong>striking single frame</strong> makes the best thumbnail. A climactic moment, an arresting composition, a face bursting with emotion — not the whole story, but \"the one shot that makes people curious.\"</p>\n\n<h3>2. It Has to Read on a Small Screen</h3>\n<p>Most viewers are watching on mobile. Check that the <strong>subject is clearly distinguishable</strong> even at thumbnail-nail size. Overly busy frames and tiny details turn to mush when shrunk down. Simple images with strong contrast win.</p>\n\n<h3>3. Use Contrast and Brightness to Catch the Eye</h3>\n<p>Against a dark listing screen, a <strong>bright, high-contrast</strong> thumbnail seems to pop right out. A thumbnail that's dark all over, by contrast, just gets scrolled past. Deliberately play with color contrast and the contrast between light and shadow.</p>\n\n<h3>4. The Power of Expression and Gaze</h3>\n<p>If there's a person in the shot, <strong>facial expression</strong> is your most powerful weapon. People are instinctively drawn to faces and emotion. Pick a moment where the subject stares straight ahead or reveals a strong emotion, and your click-through rate goes up.</p>\n\n<h3>5. Don't Duplicate the Title</h3>\n<p>If the thumbnail already carries the story, the title should give different information. Let the thumbnail show the \"mood\" while the title tells us \"what happens\" — <strong>divide the roles between them.</strong> When both say the same thing, you cut your information in half.</p>\n\n<h3>In Summary</h3>\n<p>A thumbnail is your work's poster. Just as a cinema poster shapes a film's first impression, a single thumbnail can make or break your view count. Right after you finish, don't just grab \"any old frame\" — choose <strong>the best single shot</strong> and design that first impression.</p>\n"
  },
  "power-of-series": {
    "title": "A Series Beats a Single Hit — The Compounding Power of Serialized Content",
    "excerpt": "A steady series builds a creator more than one viral hit ever will. Here are three forces that serialized work brings to bear.",
    "body": "\n<p>Many creators dream of \"the one viral hit.\" But what actually grows a creator is usually <strong>a steady series</strong>. Why are consecutive base hits more powerful than a single home run?</p>\n\n<h3>1. The Audience Waits for \"What's Next\"</h3>\n<p>A one-off video gets consumed and forgotten. A series, though, creates <strong>anticipation</strong>. The feeling of \"I wonder what the next episode holds\" is the single most powerful device for bringing viewers back. When the world, the characters, and the style carry over, the audience starts subscribing not to one video, but to <strong>you</strong>.</p>\n\n<h3>2. It Gets Easier the More You Make</h3>\n<p>A series' hidden advantage is <strong>production efficiency</strong>. Once you've locked in your character look, color palette, and prompt style in the first episode, every episode after that reuses those assets. You're not starting from scratch each time, so you can produce faster and more consistently as you go. In AI video, <strong>maintaining a consistent character and tone</strong> is an especially big weapon.</p>\n\n<h3>3. Revenue Compounds</h3>\n<p>CREAITE's subscription revenue is distributed in proportion to watch time. As a series builds up, viewers don't stop after just episode one — they watch <strong>several episodes back-to-back</strong>. One viewing leads into the next, and watch time compounds. The same goes for licensing sales: multiple clips born from a single world have a strong chance of selling together.</p>\n\n<h3>It Doesn't Have to Be Grand</h3>\n<p>A series doesn't need to be some sprawling franchise. \"The four seasons of the same place,\" \"a day in one character's life,\" \"a different emotion in 30 seconds every week\" — <strong>a single loose thread</strong> is enough. What matters is that viewers recognize, \"Ah, this person does a series.\"</p>\n\n<h3>The One You Start Today Is Episode 1</h3>\n<p>You don't need a perfect series plan before you begin. It's enough just to <strong>think of the video you make today as \"Episode 1.\"</strong> If it lands well, keep going; if not, change direction. A creator's growth comes not from a hit, but from <strong>accumulation</strong>.</p>\n"
  },
  "ai-video-music-sound": {
    "title": "Sound Is Half the Story — How to Score an AI Video with Music and Sound",
    "excerpt": "While your eyes take in the screen, emotion arrives through your ears. Here's how to complete a video's mood through sound, even on zero budget.",
    "body": "\n<p>Try an experiment. Watch a favorite film's iconic scene on mute, and its power is cut in half. That's because we watch a video with our eyes, but <strong>emotion arrives through our ears</strong>. No matter how gorgeous the visuals you create with AI, if the sound is empty, it isn't finished.</p>\n\n<h3>1. Choose Music by \"Emotion,\" Not \"Genre\"</h3>\n<p>A common mistake when picking background music is matching by genre — \"it's sci-fi, so electronic music.\" Instead, choose based on <strong>the emotion you want the audience to feel in this scene</strong>. Is it tension, elation, or loneliness? The same footage becomes a completely different story depending on the music.</p>\n\n<h3>2. Pacing — Match Your Cuts to the Music's Rhythm</h3>\n<p>A pro's edit syncs cut transitions to the <strong>beat</strong> of the music. Scenes change as the music swells, and cuts run long during the quiet passages. This \"synced breathing between music and image\" is the subtle difference that separates amateurs from professionals.</p>\n\n<h3>3. Silence Is Sound Too</h3>\n<p>You don't need music running the whole way through. In fact, <strong>cutting the sound out</strong> at a decisive moment creates a powerful emphasis. It's especially effective in horror and tension scenes. Just as \"filling\" a scene with sound is direction, so is \"emptying\" it.</p>\n\n<h3>4. Add Realism with Ambient Sound</h3>\n<p>Layer <strong>ambient sound</strong> (rain, wind, city noise) softly beneath the music, and a scene feels far more real. Viewers won't consciously notice it, but those subtle sounds create the sense that \"a real space exists here.\"</p>\n\n<h3>5. Volume Balance — Music Should \"Support\" the Screen</h3>\n<p>Music that's too loud overwhelms the image; too quiet and it's worse than nothing. Background music is <strong>a supporting player, not the lead</strong>. The visuals and the narration (if any) belong up front, with the music resting gently beneath them.</p>\n\n<h3>You Don't Need a Budget</h3>\n<p>These days there are plenty of free and low-cost music libraries with no copyright worries. What matters isn't expensive music but <strong>music that fits the scene</strong>. Those 30 minutes you spend scoring a finished video can transform the entire impression of the work. Put as much care into the sound as you do into the visuals.</p>\n"
  },
  "consistent-character": {
    "title": "Keeping the Same Face — The Craft of Character Consistency in AI Video",
    "excerpt": "When your lead's face changes with every scene, immersion falls apart. Here are practical ways to keep a character consistent in AI video.",
    "body": "\n<p>When you tell a story with AI video, you hit one big wall: <strong>character consistency.</strong> If the lead in scene 1 looks like a different person in scene 3, the audience gets lost trying to follow along. The more your video relies on narrative, the more fatal this problem becomes.</p>\n\n<h3>Why does the face keep changing?</h3>\n<p>Most generation tools draw a fresh picture every time. Say only \"young man\" and you get a different young man with each generation, because the AI has no concept of \"that same person from last time.\" So <strong>consistency doesn't happen on its own — you have to build it deliberately.</strong></p>\n\n<h3>1. Lock the character into a 'sentence'</h3>\n<p>Define your lead's appearance as a <strong>specific, fixed phrase</strong> and paste it identically into every scene prompt. \"Korean man in his late 20s, short black hair, angular jawline, gray hoodie, scar on the left eyebrow\" — the more detailed you get, the higher the consistency. Vague descriptions change every time.</p>\n\n<h3>2. Use reference images</h3>\n<p>Many tools support a <strong>reference image</strong> feature. Settle on one character image you like, then generate later scenes based on that image, and the face holds up far better. Building a 'character sheet' before you start is the textbook approach.</p>\n\n<h3>3. Don't close up on the face every time</h3>\n<p>A clever workaround. The larger and more head-on you frame the face, the more the tiny discrepancies stand out. Mixing in <strong>back views, silhouettes, long shots, and partial shots</strong> eases the consistency burden and makes your directing more varied too. Save the frontal close-up for the moments that truly need it.</p>\n\n<h3>4. Fix identity with wardrobe and props</h3>\n<p>Even if the face shifts a little, the <strong>same clothes and same props</strong> tell the audience it's the same person. A red scarf, a specific jacket, a single eyepatch — one strong visual marker can be more powerful than ten perfectly matched faces. Choose a signature for your hero.</p>\n\n<h3>5. Give up on perfection, aim for 'good enough'</h3>\n<p>With today's technology, a 100% identical face is hard. Lower the bar to <strong>\"enough that the audience accepts it as the same person.\"</strong> The human brain is more forgiving than you'd think — get the clothes, hair, and context right, and it fills in the small facial differences on its own.</p>\n\n<p>Character consistency is the core challenge of AI video storytelling, and handled well, it's a major differentiator. A story with a living character stays with people longer than a video that's merely a pretty landscape.</p>\n"
  },
  "color-grading-cinematic": {
    "title": "Color Makes the Film — Giving AI Video a Cinematic Tone",
    "excerpt": "That 'somehow it feels like a movie' quality is mostly color. How to turn an ordinary clip cinematic with post-production grading.",
    "body": "\n<p>Same scene — yet one looks like a YouTube clip and another looks like a movie. A big part of that difference is <strong>color</strong>. Color grading, the tuning of color after the shoot, is the final stage Hollywood pours the most care into. AI video is no different — generating isn't the finish line; you complete it by grading the color.</p>\n\n<h3>1. Start with contrast and saturation</h3>\n<p>The fundamentals. Deepen the shadows a touch (contrast up) and pull the color back slightly (saturation down a bit), and you instantly get a 'premium' feel. AI output is often too vivid and glaring; just easing that down changes the whole impression.</p>\n\n<h3>2. Build emotion with color temperature</h3>\n<p>Warm tones (orange, gold) convey nostalgia, romance, and hope; cool tones (blue, teal) convey solitude, tension, and the future. Unifying everything with a <strong>color temperature that matches the scene's emotion</strong> binds the frame into a single mood.</p>\n\n<h3>3. The magic of 'teal and orange'</h3>\n<p>There's a color pairing blockbusters love. <strong>Warm orange for the subject (skin tones), cool teal for the background (shadows).</strong> This contrast makes the subject pop from the background and adds depth to the frame. Overdo it and it looks cheap, but used subtly it's a quick fix.</p>\n\n<h3>4. Tie everything together in one tone</h3>\n<p>When you stitch multiple clips together and each has its own color, it looks like a patchwork quilt. <strong>Apply the same grade across the whole thing</strong> to unify it into a single look. That alone makes disparate clips feel like 'one work.'</p>\n\n<h3>5. Vignetting and film grain, in small doses</h3>\n<p>Darkening the edges of the frame slightly (vignetting) draws the eye to the center. A very fine film grain erases the slickness of digital and adds a 'film' texture. The key with both is to use <strong>just a little — barely noticeable.</strong></p>\n\n<h3>Color grading is a language called 'mood'</h3>\n<p>Color steers emotion before the audience is even aware of it. If shooting (generating) is 'what did I capture,' grading is 'what mood do I want them to watch it in.' Spend just 30 minutes grading a finished video. The same clip takes on a completely different class.</p>\n"
  },
  "title-that-clicks": {
    "title": "The Title Decides Fate — Writing Video Titles That Earn the Click",
    "excerpt": "Even a great film is finished if people scroll past the title. The principles of a good title — sparking curiosity without stooping to clickbait.",
    "body": "\n<p>If the thumbnail catches the eye, the title <strong>decides the click</strong>. From a list, viewers read a few words of the title and decide whether to watch. It would be a shame for a work you labored over to be passed by because of a single line of a title.</p>\n\n<h3>1. Leave curiosity, don't tell it all</h3>\n<p>A good title poses <strong>a question, not an answer</strong>. \"The lightest thing flies the highest\" is more intriguing than \"A paper airplane went to space.\" Don't summarize the content — make people want to watch.</p>\n\n<h3>2. The specific is more compelling</h3>\n<p>\"A cool space video\" stirs nothing. \"An orbiting sunrise, two paper airplanes\" paints a picture. <strong>Concrete images beat abstract adjectives</strong> at earning the click.</p>\n\n<h3>3. Slip in one emotional word</h3>\n<p>People respond to emotion, not information. Add one <strong>emotionally charged word</strong> to the title (stillness, last, chase, longing…) and the temperature jumps. It's stronger than a dry list of facts.</p>\n\n<h3>4. Clickbait wins once and loses forever</h3>\n<p>The most important principle. <strong>A title must never betray the content.</strong> An exaggerated clickbait title earns one click, but a disappointed audience will never trust you again. A creator's asset is the reputation that 'this person's titles are reliable.'</p>\n\n<h3>5. Keep it short, front-load the weight</h3>\n<p>In a list, titles often get cut off at the end. <strong>Put the key words up front</strong> and keep the whole thing short. The ideal length reads at a glance on a mobile screen.</p>\n\n<h3>A title is the work's first sentence</h3>\n<p>Just as a novel's first sentence pulls the reader in, the title is the first sentence inviting the audience into your work. After finishing a video, don't slap on 'any old title' — invest just 5 more minutes in the title. Those 5 minutes can multiply your view count.</p>\n"
  },
  "ai-video-trends-2026": {
    "title": "2026: Where Is AI Video Headed — Reading the Current Wave",
    "excerpt": "The tools evolve every month, and audience expectations rise with them. Here's a look at the shifts happening in AI video creation right now.",
    "body": "\n<p>The AI video field feels different every month. What was 'astonishing' half a year ago looks ordinary now. As the technology levels off, we look at where the center of gravity in creation is shifting.</p>\n\n<h3>1. From 'generating' to 'directing'</h3>\n<p>Early on, the mere fact that \"you can make video with AI\" was the story. Now anyone can. So the axis of competition has moved <strong>from 'can you make it' to 'how do you direct it.'</strong> Beyond prompting, editing, color, sound, and narrative are what separate skill.</p>\n\n<h3>2. From clips to 'works'</h3>\n<p>One slick 15-second clip no longer impresses. Audiences want <strong>story and emotion</strong>. Shorts woven from multiple clips, ongoing series, and content with a whole universe are drawing attention. This is the age of <strong>sustained narrative</strong> over one-off spectacle.</p>\n\n<h3>3. Consistency becomes the measure of skill</h3>\n<p>Holding the same character across many scenes and binding tone and color consistently — this <a href=\"?info=magazine&article=consistent-character\">consistency management</a> has become the new line between amateur and pro. Unity across ten cuts is harder, and more valuable, than dazzle in a single cut.</p>\n\n<h3>4. The paradox of 'more real than real'</h3>\n<p>The closer the technology gets to hyperrealism, the more <strong>deliberate style</strong> (an animated look, abstraction, a specific painter's tone) draws attention as personality. Once everyone can do photorealism, the differentiator isn't 'what you render photoreal' but 'what worldview you have.'</p>\n\n<h3>5. Creation and distribution converge</h3>\n<p><strong>Where your work is recognized as valuable</strong> is becoming as important as making it. Infrastructure like dedicated stages for AI video, curation, and license trading is taking hold. That's good news for creators — the paths to turn what you make into value are widening. (Related: <a href=\"?info=magazine&article=creaite-is-your-distributor\">The solo director's distributor</a>)</p>\n\n<h3>What doesn't change</h3>\n<p>The tools will keep changing, but one thing won't. <strong>A story that moves the human heart</strong> always lands. More than chasing the latest tool, what you want to say is what ultimately keeps a creator around. Technology only assists.</p>\n"
  },
  "creator-workflow": {
    "title": "A Day in the Life of an AI Video Creator — The Workflow Behind a Single Piece",
    "excerpt": "From idea to finished cut, in what order does the real work actually flow? Here's a realistic look at how one piece comes together.",
    "body": "\n<p>There's a myth that AI video is \"one button and done.\" In reality, it takes several passes of hands-on work. But once you understand the flow, the overwhelm disappears. Here's the realistic workflow behind a single piece, step by step.</p>\n\n<h3>1. Ideation (10 min) — Start with a note</h3>\n<p>No grand pitch document required. You jot down a single passing image or sentence. A <strong>one-line seed</strong> like \"a paper airplane in the rain\" or \"the last transmission\" is enough. The point of this stage isn't perfection — it's <strong>getting started</strong>.</p>\n\n<h3>2. Scene design (20 min) — Lay out the moments</h3>\n<p>Break the seed into 3 to 8 scenes. Write each scene as a single line to establish the flow (setup → development → climax). This is also when you decide <a href=\"?info=magazine&article=power-of-series\">whether to go with a series</a>.</p>\n\n<h3>3. Generation (the longest — the time of repetition)</h3>\n<p>Build each scene using the <a href=\"?info=magazine&article=ai-video-prompt-formula\">five prompt elements</a>. This is where the real time goes. It's normal to <strong>regenerate a single shot 3 to 10 times</strong> until you get a result you like. Don't get discouraged — the pros do the same.</p>\n\n<h3>4. Selection (10 min) — The courage to cut</h3>\n<p>Keep <strong>only the best</strong> of what you generated. As painful as it is, drop any shot that doesn't fit the flow. Editing is about subtraction, not addition.</p>\n\n<h3>5. Assembly and editing (30 min) — Binding it into one piece</h3>\n<p>Splice the clips in order, smooth them with crossfades and fades, unify the tone with <a href=\"?info=magazine&article=color-grading-cinematic\">color grading</a>, and lay down the <a href=\"?info=magazine&article=ai-video-music-sound\">music</a>. This is the stage where 'fragments' become 'a work.'</p>\n\n<h3>6. Packaging (10 min) — Title and thumbnail</h3>\n<p>Finishing the cut isn't the end. Choose your <a href=\"?info=magazine&article=title-that-clicks\">title</a> and <a href=\"?info=magazine&article=ai-video-thumbnail-guide\">thumbnail</a> with care. These 10 minutes can multiply your view count several times over.</p>\n\n<h3>7. Publishing (5 min) — Sending it out into the world</h3>\n<p><a href=\"?tab=upload\">Upload to CREAITE</a> and set the genre, rating, and price. Then jot down your next idea and call it a day.</p>\n\n<h3>There's no such thing as a perfect day</h3>\n<p>Not every stage goes smoothly every time. Some days the generation won't come together; some days the edit hits a wall. What matters is <strong>knowing the flow and keeping it turning</strong>. The more you repeat this routine, the faster each stage gets — and the better the results.</p>\n"
  },
  "collab-filmmaking": {
    "title": "Not Alone, But Together — Collaborative Filmmaking in the AI Era",
    "excerpt": "AI made solo production possible, but making it together takes you further. What collaboration means anew in AI video creation.",
    "body": "\n<p>One of the appeals of AI video is that you can make a whole piece on your own. Yet paradoxically, in the AI era <strong>collaboration</strong> becomes an even more intriguing possibility. Why is that?</p>\n\n<h3>The limits of alone, the reach of together</h3>\n<p>Solo creation is fast and free, but it ultimately stays confined within <strong>one person's taste and abilities</strong>. When several people come together, their strengths combine. One is great at prompting, another excels at editing, another is a gifted storyteller. Because AI has removed the physical barriers to production, collaboration is now less about 'dividing the labor' and more about 'amplification.'</p>\n\n<h3>1. Relay style — one person, one scene each</h3>\n<p>This is the most fun experiment. One person makes scene 1, then the next person carries the flow forward into scene 2. An <strong>improvised film</strong> where no one knows the ending as it unfolds — the charm is in the unexpected turns.</p>\n\n<h3>2. Divided roles — director, generation, editing, music</h3>\n<p>Split the roles like a traditional film production. Someone plans, someone pulls the clips, someone edits. When everyone focuses on what they do best, you reach a level of polish no one could hit alone.</p>\n\n<h3>3. Shared universe — same stage, different stories</h3>\n<p>Several creators share <strong>a single universe</strong> and each make their own episode. Like the Marvel universe, individual works come together to form a larger story.</p>\n\n<h3>What collaboration creates — more than a finished work</h3>\n<p>Making it together produces more than just an end product. It generates <strong>feedback, stimulation, and the momentum to keep going</strong>. Creation that wears you out when you're alone becomes something you can enjoy for the long haul with peers. That's precisely why CREAITE has spaces for community and collaboration.</p>\n\n<p>AI made creation 'possible even alone,' but the joy of creating is still doubled 'when it's shared.' For your next piece, don't struggle in isolation — start it with someone.</p>\n"
  },
  "salvage-failed-clips": {
    "title": "Reviving Ruined Clips — How to Make Use of Failed Generations",
    "excerpt": "Do you throw out every clip that doesn't turn out the way you wanted? Here's an editor's eye for turning failures into finished work.",
    "body": "\n<p>When you make videos with AI, 'ruined clips' pile up like a mountain. A figure with six hands, a background that suddenly warps, an awkward movement. But a seasoned editor salvages <strong>a usable 3 seconds</strong> from those failures. Here's what to try before you hit delete.</p>\n\n<h3>1. Look for the 'moment,' not the whole</h3>\n<p>Even if a 15-second clip is a total mess, often <strong>2 to 3 seconds inside it are perfectly fine</strong>. Cut only up to the instant right before things go wrong. Keep it short and jump to the next shot, and the flaws stay invisible. <strong>A run of short cuts</strong> hides mistakes better than one long take.</p>\n\n<h3>2. Cover it with speed</h3>\n<p>Awkward movement can be disguised with <strong>playback speed</strong>. Speed it up slightly and it blurs so the flaws show less; slow it down and it actually becomes a style. Speed is editing's magic wand.</p>\n\n<h3>3. Crop and zoom to cut out the flaw</h3>\n<p>If one corner of the frame is broken, just <strong>crop that part out and zoom in</strong>. If a figure's face looks off, moving the frame to the hands, feet, or background works too. What the audience doesn't see may as well not exist.</p>\n\n<h3>4. Hide it under darkness, smoke, and effects</h3>\n<p>Lay <strong>shadow, fog, lens flare, or particles</strong> over a flaw and it gets covered naturally. In horror and mystery genres, this 'barely visible' quality actually heightens the mood. You're turning a weakness into a concept.</p>\n\n<h3>5. Redirect the eye with a cutaway</h3>\n<p>Insert <strong>a different shot (a detail shot, a reaction shot)</strong> in the middle of an odd scene and the audience's attention scatters, so they miss the flaw. This old editing technique still works just as well in the AI era.</p>\n\n<h3>Failure is raw material</h3>\n<p>If you insist on using only perfect clips, you'll never finish anything. Even a pro's output, when you look closely, is <strong>imperfect fragments cleverly woven together</strong>. Don't delete your failures folder — look at it again with an editor's eye. There's a usable 3 seconds hiding in there.</p>\n"
  },
  "find-your-style": {
    "title": "Finding Your Own Style — How to Become 'Recognizable' in the AI Era",
    "excerpt": "In an age where anyone can make good videos, what remains in the end is 'your-ness.' How to build a signature that's yours alone.",
    "body": "\n<p>As AI removed the barrier to production, a paradox emerged. Once anyone could make a stunning video, the world filled up with <strong>look-alike results</strong>. In an era like this, the creators who survive share one trait: they have <strong>a recognizable style</strong>.</p>\n\n<h3>Style is born from 'constraint'</h3>\n<p>Paradoxically, when you can do everything, individuality vanishes. Style is born from <strong>deliberate constraint</strong>. \"I always use this color palette,\" \"I always move the camera this way,\" \"I only do this subject\" — the more you narrow yourself, the clearer your voice becomes.</p>\n\n<h3>1. Fix a recurring visual element</h3>\n<p>A specific color palette, a specific aspect ratio, a specific transition style. Pick one <strong>visual signature that recurs in every piece</strong>. Through that repetition, your audience remembers you. A consistent look is more powerful than a logo.</p>\n\n<h3>2. Narrow the 'emotional grain' you work in</h3>\n<p>Don't try to cover every emotion. \"I paint loneliness,\" \"I capture overwhelming moments\" — once you have <strong>an emotional territory of your own</strong>, people come to you when they want a particular feeling.</p>\n\n<h3>3. Don't imitate perfection — reveal your taste</h3>\n<p>Technically flawless video is now commonplace. If anything, imperfection that's <strong>infused with your taste and perspective</strong> becomes your individuality. Doing it your way lasts longer than doing it as well as everyone else.</p>\n\n<h3>4. Style is discovered — don't try to manufacture it</h3>\n<p>Declaring \"from today, this is my style\" won't make it appear. Style is <strong>something that seeps out on its own as you make a lot of work</strong>. After ten pieces, twenty pieces, you start to see your own recurring habits and preferences. Notice them and lean into them, and they become your signature.</p>\n\n<h3>Your-ness is the final edge</h3>\n<p>Tools get leveled, techniques get caught up to. But <strong>'your gaze' cannot be copied.</strong> What you find beautiful, what moves your heart — that uniqueness is what ultimately keeps a creator around. Before chasing the latest technique, first ask yourself what it is you want to say.</p>\n"
  }
};

export const MAGAZINE_ARTICLES: MagazineArticle[] = RAW_ARTICLES.map((a) => {
  const en = ARTICLES_EN[a.slug];
  return {
    ...a,
    title: { ko: a.title, en: en?.title ?? a.title },
    excerpt: { ko: a.excerpt, en: en?.excerpt ?? a.excerpt },
    body: { ko: a.body, en: en?.body ?? a.body },
  };
});

export function getArticle(slug: string): MagazineArticle | undefined {
  return MAGAZINE_ARTICLES.find((a) => a.slug === slug);
}
