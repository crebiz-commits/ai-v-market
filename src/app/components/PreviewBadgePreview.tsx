// ════════════════════════════════════════════════════════════════════════════
// 미리보기 배지 디자인 미리보기 (?preview=preview-badge)
//
// 비구독자에게 표시되는 "1분 미리보기 — 구독 시 풀 영상" 배지의 3가지 시안 비교.
// 영상을 가리는 정도와 가독성을 시각적으로 비교 후 선택.
// ════════════════════════════════════════════════════════════════════════════

import { Lock } from "lucide-react";

const MOCK_THUMBNAIL =
  "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop";

function VideoBox({ children, title }: { children?: React.ReactNode; title: string }) {
  return (
    <div className="w-full">
      <h3 className="text-white text-sm font-bold mb-2">{title}</h3>
      <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-white/10">
        <img src={MOCK_THUMBNAIL} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
        {/* 우상단 Duration Badge (기존 UI 와 동일) */}
        <div className="absolute top-4 right-4 px-3 py-1 bg-black/70 backdrop-blur-sm rounded-full text-white text-sm">
          2:56
        </div>
        {children}
      </div>
    </div>
  );
}

export function PreviewBadgePreview() {
  return (
    <div className="h-screen overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-4xl mx-auto py-8 px-6 pb-24">
        <header className="mb-6">
          <h1 className="text-2xl font-black text-white mb-1">
            미리보기 배지 디자인 비교
          </h1>
          <p className="text-sm text-gray-400">
            비구독자에게 표시되는 "1분 미리보기 — 구독 시 풀 영상" 배지의 영상 가림 정도와 가독성을 비교하세요. A / B / C 중 선택해서 알려주시면 적용합니다.
          </p>
        </header>

        <div className="space-y-8">
          {/* 현재 (변경 전 비교용) */}
          <section>
            <VideoBox title="📍 현재 (변경 전) — 영상 상단 중앙, amber 90%">
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-amber-500/90 backdrop-blur-sm rounded-full text-white text-xs font-black shadow-lg flex items-center gap-1.5 pointer-events-none">
                <Lock className="w-3.5 h-3.5" />
                1분 미리보기 — 구독 시 풀 영상
              </div>
            </VideoBox>
          </section>

          {/* A안 — 투명도 + 크기 축소 */}
          <section>
            <VideoBox title="A안 · 현재 위치 유지 + 투명도 50% + 크기 축소">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-2 py-1 bg-amber-500/50 backdrop-blur-md rounded-full text-white text-[10px] font-bold flex items-center gap-1 pointer-events-none">
                <Lock className="w-3 h-3" />
                1분 미리보기 — 구독 시 풀 영상
              </div>
            </VideoBox>
            <p className="text-xs text-gray-500 mt-2">
              👉 위치 그대로. 작고 반투명해서 영상 노출은 늘지만 가독성은 약해짐.
            </p>
          </section>

          {/* B안 — 영상 위 슬림 헤더 */}
          <section>
            <div className="w-full">
              <h3 className="text-white text-sm font-bold mb-2">B안 · 영상 위 슬림 헤더 (영상 영역 외부)</h3>
              <div className="rounded-2xl overflow-hidden border border-white/10">
                {/* 영상 위 슬림 헤더 */}
                <div className="bg-gradient-to-r from-amber-500/90 via-amber-500/95 to-amber-500/90 px-4 py-2 flex items-center justify-center gap-2 text-white text-xs font-bold">
                  <Lock className="w-3.5 h-3.5" />
                  1분 미리보기 — 구독 시 풀 영상
                </div>
                {/* 영상 영역 */}
                <div className="relative aspect-video bg-black">
                  <img src={MOCK_THUMBNAIL} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
                  <div className="absolute top-4 right-4 px-3 py-1 bg-black/70 backdrop-blur-sm rounded-full text-white text-sm">
                    2:56
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              👉 영상을 전혀 안 가림. 메시지가 더 명확함. 영상 영역이 살짝 줄어듦 (~32px 헤더 추가).
            </p>
          </section>

          {/* B-2안 — 영상 위 슬림 헤더 (다크 톤) */}
          <section>
            <div className="w-full">
              <h3 className="text-white text-sm font-bold mb-2">B-2안 · 영상 위 슬림 헤더 (다크 톤, 더 차분)</h3>
              <div className="rounded-2xl overflow-hidden border border-white/10">
                <div className="bg-black/90 px-4 py-2 flex items-center justify-center gap-2 text-amber-300 text-xs font-bold border-b border-amber-500/30">
                  <Lock className="w-3.5 h-3.5" />
                  1분 미리보기 — 구독 시 풀 영상
                </div>
                <div className="relative aspect-video bg-black">
                  <img src={MOCK_THUMBNAIL} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
                  <div className="absolute top-4 right-4 px-3 py-1 bg-black/70 backdrop-blur-sm rounded-full text-white text-sm">
                    2:56
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              👉 B안과 동일 구조, 다크 톤이라 영상과 자연스럽게 어울림. 덜 튐.
            </p>
          </section>

          {/* C안 — 우상단 자물쇠만 */}
          <section>
            <VideoBox title="C안 · 우상단 자물쇠 아이콘만 (Duration 옆)">
              {/* Duration Badge 옆에 작은 자물쇠 */}
              <div className="absolute top-4 right-4 flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-full bg-amber-500/90 flex items-center justify-center backdrop-blur-sm">
                  <Lock className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="px-3 py-1 bg-black/70 backdrop-blur-sm rounded-full text-white text-sm">
                  2:56
                </div>
              </div>
            </VideoBox>
            <p className="text-xs text-gray-500 mt-2">
              👉 영상 거의 안 가림. 자물쇠 의미가 직관적이지 않을 수 있음 (텍스트 없음). 호버 시 툴팁 추가 가능.
            </p>
          </section>

          {/* D안 — 하단 슬림 배너 */}
          <section>
            <VideoBox title="D안 · 영상 하단 슬림 띠 (Bunny 컨트롤 위)">
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-4 py-2 flex items-center justify-center gap-2 text-amber-300 text-xs font-bold pointer-events-none">
                <Lock className="w-3.5 h-3.5" />
                1분 미리보기 — 구독 시 풀 영상
              </div>
            </VideoBox>
            <p className="text-xs text-gray-500 mt-2">
              👉 영상 콘텐츠 (얼굴/주제) 가 보통 중앙·상단이라 하단 띠는 가림 적음. 단 Bunny 컨트롤바와 겹칠 수 있음.
            </p>
          </section>
        </div>

        <footer className="mt-12 p-4 rounded-xl bg-white/5 border border-white/10">
          <p className="text-sm text-white font-bold mb-2">📌 선택해서 알려주세요</p>
          <ul className="text-xs text-gray-300 space-y-1">
            <li>• <span className="font-bold">A</span> — 현재 위치, 투명도/크기만 축소</li>
            <li>• <span className="font-bold">B</span> — 영상 위 amber 슬림 헤더 (영상 안 가림)</li>
            <li>• <span className="font-bold">B-2</span> — 영상 위 다크 슬림 헤더 (덜 튐)</li>
            <li>• <span className="font-bold">C</span> — 우상단 자물쇠 아이콘만</li>
            <li>• <span className="font-bold">D</span> — 영상 하단 슬림 띠</li>
          </ul>
        </footer>
      </div>
    </div>
  );
}
