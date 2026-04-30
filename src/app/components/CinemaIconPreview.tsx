import {
  Film,
  Clapperboard,
  Tv,
  PlayCircle,
  Popcorn,
  Video,
  Camera,
  Sparkles,
  Star,
  Award,
  type LucideIcon,
} from "lucide-react";

interface IconOption {
  name: string;
  Icon: LucideIcon;
  desc: string;
  recommend?: boolean;
}

const options: IconOption[] = [
  { name: "Film", Icon: Film, desc: "필름 스트립 — 클래식 영화 직관적", recommend: true },
  { name: "Clapperboard", Icon: Clapperboard, desc: "슬레이트 — 영화 제작 느낌" },
  { name: "Tv", Icon: Tv, desc: "TV — 시청 / 스트리밍" },
  { name: "PlayCircle", Icon: PlayCircle, desc: "재생 — 영상 콘텐츠 직관" },
  { name: "Popcorn", Icon: Popcorn, desc: "팝콘 — 친근한 영화관 분위기" },
  { name: "Video", Icon: Video, desc: "캠코더 — 영상 제작" },
  { name: "Camera", Icon: Camera, desc: "카메라 — 촬영 도구" },
  { name: "Sparkles", Icon: Sparkles, desc: "반짝임 — 큐레이션·프리미엄" },
  { name: "Star", Icon: Star, desc: "별 — 추천·즐겨찾기" },
  { name: "Award", Icon: Award, desc: "어워드 — 시상식·트로피" },
];

// 데스크탑 탭 미리보기
function DesktopTabPreview({ Icon, label }: { Icon: LucideIcon; label: string }) {
  return (
    <div className="bg-white/5 p-1 rounded-xl border border-white/5 inline-flex">
      <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold select-none text-white">
        <Icon className="w-[18px] h-[18px] shrink-0" />
        {label}
      </button>
    </div>
  );
}

// 모바일 하단 탭 미리보기
function MobileBottomTabPreview({ Icon, label, active = true }: { Icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <div className="bg-background/80 border border-white/5 rounded-xl px-4 py-3 inline-flex flex-col items-center gap-1">
      <Icon className={`w-6 h-6 ${active ? "text-[#8b5cf6]" : "text-muted-foreground"}`} />
      <span className={`text-[10px] font-semibold ${active ? "text-[#8b5cf6]" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

export function CinemaIconPreview() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">🎬 시네마 탭 아이콘 비교</h1>
        <p className="text-gray-400 mb-8">
          탭 이름 "시네마"에 어울리는 아이콘 후보. 각 옵션을 모바일/데스크탑 탭 모양으로 함께 미리보기.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {options.map(({ name, Icon, desc, recommend }) => (
            <div
              key={name}
              className={`bg-[#111] rounded-2xl p-5 border ${recommend ? "border-yellow-500/50" : "border-white/10"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-white">{name}</h3>
                {recommend && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 rounded">추천</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-5">{desc}</p>

              <div className="flex flex-col gap-3">
                {/* 큰 아이콘 단독 */}
                <div className="bg-[#1a1a1a] rounded-xl p-6 flex items-center justify-center">
                  <Icon className="w-16 h-16 text-[#a78bfa]" strokeWidth={1.5} />
                </div>

                {/* 데스크탑 탭 */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">데스크탑 탭</p>
                  <DesktopTabPreview Icon={Icon} label="시네마" />
                </div>

                {/* 모바일 하단 탭 */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">모바일 하단</p>
                  <MobileBottomTabPreview Icon={Icon} label="시네마" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 p-6 bg-[#111] rounded-2xl border border-white/10">
          <h2 className="text-xl font-bold mb-3">선택 후 알려주세요</h2>
          <p className="text-gray-400 text-sm">
            아이콘 이름(예: "Film")으로 알려주시면 적용합니다.
            <br />
            마음에 드는 게 없으면 다른 옵션도 제안 드릴 수 있어요.
          </p>
        </div>
      </div>
    </div>
  );
}
