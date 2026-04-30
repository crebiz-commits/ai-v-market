import { motion } from "motion/react";
import { Upload as UploadIcon } from "lucide-react";
import { CreaiteLogo } from "./CreaiteLogo";

/**
 * 하단 nav 업로드 버튼 디자인 비교 프리뷰
 * URL: ?preview=uploadbtn
 *
 * - 좌: 기존 (UploadIcon)
 * - 우: 신규 (CreaiteLogo, 비활성=정적 / 활성=애니메이션)
 */
export function UploadButtonPreview() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">📤 하단 업로드 버튼 비교</h1>
        <p className="text-gray-400 mb-8">
          하단 네비게이션 중앙의 시그니처 액션 버튼.
          <br />
          좌측이 현재 디자인 (UploadIcon), 우측이 새 디자인 (CREAITE 로고).
        </p>

        {/* 비교 1: 비활성 상태 */}
        <Section title="① 비활성 상태 (다른 탭에 있을 때)" desc="평상시 보이는 모습 — 시야 피로를 줄이려면 정적이 유리">
          <div className="grid grid-cols-2 gap-6">
            <Card label="기존: UploadIcon">
              <OldButton active={false} />
            </Card>
            <Card label="신규: 로고 (정적)" highlight>
              <NewButton active={false} />
            </Card>
          </div>
        </Section>

        {/* 비교 2: 활성 상태 */}
        <Section title="② 활성 상태 (업로드 탭에 있을 때)" desc="현재 모드를 강하게 표시 — 그라디언트 링 + 글로우 + 로고 애니메이션">
          <div className="grid grid-cols-2 gap-6">
            <Card label="기존: 그라디언트 배경 + 흰 아이콘">
              <OldButton active={true} />
            </Card>
            <Card label="신규: 그라디언트 링 + 다크 센터 + 애니 로고" highlight>
              <NewButton active={true} />
            </Card>
          </div>
        </Section>

        {/* 비교 3: 호버 효과 */}
        <Section title="③ 호버 시 (데스크탑)" desc="살짝 떠오르는 효과로 인터랙티브 감각">
          <div className="grid grid-cols-2 gap-6">
            <Card label="기존">
              <OldButton active={false} hover />
            </Card>
            <Card label="신규" highlight>
              <NewButton active={false} hover />
            </Card>
          </div>
        </Section>

        {/* 실제 하단 nav 시뮬레이션 */}
        <Section title="④ 실제 하단 네비게이션 시뮬레이션" desc="모바일에서 보이는 전체 컨텍스트">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">기존 디자인</p>
              <BottomNavMockup variant="old" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">신규 디자인 (비활성)</p>
              <BottomNavMockup variant="new" activeTab="discovery" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">신규 디자인 (활성: 업로드 탭)</p>
              <BottomNavMockup variant="new" activeTab="upload" />
            </div>
          </div>
        </Section>

        <div className="mt-12 p-6 bg-[#111] rounded-2xl border border-yellow-500/30">
          <h2 className="text-xl font-bold mb-3">🎯 디자인 의도</h2>
          <ul className="text-gray-300 text-sm space-y-2">
            <li>· <strong>비활성 정적 렌더</strong>: 하단 nav는 늘 보이는 영역이라 끊임없는 애니메이션은 시야 피로 유발</li>
            <li>· <strong>활성만 애니메이션</strong>: "지금 이 모드"임을 강하게 인식 — 이퀄라이저 + ▶ 펄스가 살아남</li>
            <li>· <strong>그라디언트 링 + 다크 센터</strong>: 헤더 로고와 시각적으로 차별화하면서 브랜드 모티브 공유</li>
            <li>· <strong>로고 = 시그니처 액션</strong>: 가장 눈에 띄는 위치 = 가장 중요한 행동(업로드/창작)에 브랜드 박힘</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold text-white mb-1">{title}</h2>
      <p className="text-sm text-gray-400 mb-4">{desc}</p>
      {children}
    </section>
  );
}

function Card({ label, highlight, children }: { label: string; highlight?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`bg-[#111] rounded-2xl p-8 border ${highlight ? "border-yellow-500/40" : "border-white/10"} flex flex-col items-center justify-center gap-4 min-h-[180px]`}
    >
      <div className="flex items-center justify-center">{children}</div>
      <p className="text-xs text-gray-400 text-center">{label}</p>
    </div>
  );
}

// 기존 버튼 (UploadIcon)
function OldButton({ active, hover }: { active: boolean; hover?: boolean }) {
  return (
    <motion.div
      animate={hover ? { scale: 1.05 } : {}}
      transition={{ duration: 0.3 }}
    >
      <div
        className={`w-14 h-14 rounded-full flex items-center justify-center border-[3px] border-[#0a0a0a] transition-all
          ${active
            ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] shadow-[0_0_25px_rgba(99,102,241,0.6)]"
            : "bg-[#222] shadow-lg"}
        `}
      >
        <UploadIcon className={`w-6 h-6 ${active ? "text-white" : "text-gray-300"}`} />
      </div>
    </motion.div>
  );
}

// 신규 버튼 (CreaiteLogo)
function NewButton({ active, hover }: { active: boolean; hover?: boolean }) {
  return (
    <motion.div
      animate={hover ? { scale: 1.05 } : {}}
      transition={{ duration: 0.3 }}
    >
      <div
        className={`w-14 h-14 rounded-full transition-all duration-300 border-[3px] border-[#0a0a0a] flex items-center justify-center
          ${active
            ? "bg-gradient-to-tr from-[#6366f1] via-[#ec4899] to-[#06b6d4] shadow-[0_0_25px_rgba(139,92,246,0.6)] p-[2px]"
            : "bg-[#1a1a1c] shadow-lg"}
        `}
      >
        <div
          className={`w-full h-full rounded-full flex items-center justify-center transition-colors duration-300
            ${active ? "bg-[#0a0a0a]" : "bg-transparent"}
          `}
        >
          <CreaiteLogo className="w-7 h-7 -rotate-90" still={!active} />
        </div>
      </div>
    </motion.div>
  );
}

// 하단 nav 전체 목업
function BottomNavMockup({ variant, activeTab = "discovery" }: { variant: "old" | "new"; activeTab?: string }) {
  return (
    <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-4 max-w-[420px] mx-auto">
      <div className="border-t border-white/5 bg-background/80 rounded-xl">
        <div className="flex items-center justify-around h-20 px-2">
          <TabItem label="홈" active={activeTab === "discovery"} icon="●" />
          <TabItem label="시네마" active={activeTab === "market"} icon="◆" />

          <div className="flex items-center justify-center flex-1 h-full">
            {variant === "old" ? (
              <OldButton active={activeTab === "upload"} />
            ) : (
              <div className="-mt-8">
                <NewButton active={activeTab === "upload"} />
              </div>
            )}
          </div>

          <TabItem label="커뮤니티" active={activeTab === "community"} icon="◇" />
          <TabItem label="마이" active={activeTab === "mypage"} icon="○" />
        </div>
      </div>
    </div>
  );
}

function TabItem({ label, active, icon }: { label: string; active: boolean; icon: string }) {
  return (
    <div
      className={`flex flex-col items-center gap-1 flex-1 ${
        active ? "text-[#8b5cf6]" : "text-muted-foreground"
      }`}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-[11px] font-bold">{label}</span>
    </div>
  );
}
