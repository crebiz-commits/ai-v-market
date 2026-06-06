// 개발자 전용 미리보기: 데스크탑 상단 헤더 리디자인 (?preview=desktop-header)
// 기존 문제: 네비 버튼에 whitespace-nowrap 이 없어 폭이 좁아지면 한글 라벨이 글자 단위로 줄바꿈.
// 리디자인: nowrap + shrink-0, "프리미엄 OTT"→"OTT", 반응형(좁으면 아이콘 전용).
import {
  Home, Film, Crown, Upload as UploadIcon, MessageSquare, Users, User, ShieldCheck,
  Bell, ShoppingCart, Globe, Download, LogOut,
} from "lucide-react";
import { CreaiteLogo } from "./CreaiteLogo";
import { CreaiteText } from "./CreaiteText";

const TABS = [
  { id: "discovery", label: "홈", icon: Home },
  { id: "market", label: "시네마", icon: Film },
  { id: "ott", label: "OTT", icon: Crown },        // 기존 "프리미엄 OTT" → "OTT"
  { id: "upload", label: "업로드", icon: UploadIcon },
  { id: "community", label: "커뮤니티", icon: MessageSquare },
  { id: "channel", label: "채널", icon: Users },
  { id: "mypage", label: "마이", icon: User },
  { id: "admin", label: "관리자", icon: ShieldCheck },
];

// 리디자인된 헤더 1개 — labelMode: 'show'(아이콘+라벨) | 'icononly'(아이콘만)
function HeaderBar({ labelMode }: { labelMode: "show" | "icononly" }) {
  const active = "market";
  const showLabel = labelMode === "show";
  return (
    <div className="bg-[#0d0d12]/95 border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        {/* 로고 */}
        <div className="flex items-center gap-3 shrink-0">
          <CreaiteLogo className="w-9 h-9" />
          <span className="hidden lg:block"><CreaiteText className="text-xl font-extrabold" /></span>
        </div>

        {/* 네비 (가운데) */}
        <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                title={tab.label}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold select-none whitespace-nowrap shrink-0 transition-colors ${
                  isActive ? "text-white" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }`}
              >
                {isActive && (
                  <span className="absolute inset-0 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded-lg -z-10 shadow-[0_4px_12px_rgba(99,102,241,0.3)] border border-white/10" />
                )}
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {showLabel && <span>{tab.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* 우측 액션 */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#a78bfa]/40 text-[#c4b5fd] text-xs font-bold whitespace-nowrap">
            <Download className="w-3.5 h-3.5" /> 설치
          </span>
          <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"><Globe className="w-5 h-5" /></button>
          <button className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
            <Bell className="w-5 h-5" />
            <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center">2</span>
          </button>
          <button className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
            <ShoppingCart className="w-5 h-5" />
            <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#6366f1] rounded-full text-[10px] text-white font-bold flex items-center justify-center">3</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-transparent border border-white/10 hover:bg-white/5 text-sm font-semibold text-white whitespace-nowrap">
            <LogOut className="w-4 h-4" /> 크리에잇
          </button>
        </div>
      </div>
    </div>
  );
}

export function DesktopHeaderPreview() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 space-y-10">
      <div>
        <h1 className="text-lg font-black mb-1">데스크탑 헤더 리디자인 미리보기</h1>
        <p className="text-white/50 text-xs">줄바꿈 차단(nowrap) + "프리미엄 OTT"→"OTT" + 반응형. 아래는 폭별 모습입니다.</p>
      </div>

      {/* 넓은 화면(xl+) — 아이콘 + 라벨 */}
      <div>
        <p className="text-[#c4b5fd] text-xs font-bold mb-2">① 넓은 화면 (xl, ≥1280px) — 아이콘 + 라벨</p>
        <div className="rounded-2xl overflow-hidden border border-white/10">
          <HeaderBar labelMode="show" />
        </div>
      </div>

      {/* 좁은 데스크탑(md~lg) — 아이콘 전용 */}
      <div>
        <p className="text-[#c4b5fd] text-xs font-bold mb-2">② 좁은 데스크탑 (md~lg, 768~1279px) — 아이콘 전용(툴팁), 절대 안 깨짐</p>
        <div className="rounded-2xl overflow-hidden border border-white/10 max-w-3xl">
          <HeaderBar labelMode="icononly" />
        </div>
      </div>

      <p className="text-white/40 text-xs leading-relaxed">
        · 실제 적용 시: 라벨은 <code className="text-[#c4b5fd]">xl</code> 이상에서만 표시(그 이하 아이콘 전용),
        모든 버튼 <code className="text-[#c4b5fd]">whitespace-nowrap</code> 로 줄바꿈 차단.<br />
        · "프리미엄 OTT" 라벨은 데스크탑에서 "OTT"로 단축(왕관 아이콘으로 프리미엄 느낌 유지).
      </p>
    </div>
  );
}
