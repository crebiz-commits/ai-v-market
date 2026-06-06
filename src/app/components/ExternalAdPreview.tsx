// 개발자 전용 미리보기: 홈피드 외부 광고 슬롯(ExternalAdSlot) 배치/크기 확인 (?preview=external-ad)
// 실제 홈피드(DiscoveryFeed)의 치수를 그대로 재현 —
//   컨테이너 height: calc(100dvh - 136px), 섹션 height: calc(50% - 1.5px) (한 화면에 2개)
import { Play } from "lucide-react";
import { ExternalAdSlot } from "./ExternalAdSlot";

function MockVideo({ label }: { label: string }) {
  return (
    <div className="preview-section">
      <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] to-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
            <Play className="w-5 h-5 text-white/70" fill="currentColor" />
          </div>
          <p className="text-white/60 text-sm font-bold">{label}</p>
          <p className="text-white/30 text-[11px] mt-0.5">(피드 영상 자리)</p>
        </div>
      </div>
    </div>
  );
}

export function ExternalAdPreview() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="p-3 border-b border-white/10">
        <h1 className="text-base font-black">외부 광고 슬롯 미리보기 (실제 홈피드 치수)</h1>
        <p className="text-white/50 text-[11px] mt-1 leading-relaxed">
          실제 홈피드와 동일하게 한 화면에 섹션 2개(각 50% 높이)가 보입니다. 영상 4개마다 광고 슬롯이
          한 섹션을 차지합니다. 지금은 ID 미설정이라 placeholder — 승인·ID 등록 시 이 자리에 실제 광고가 뜹니다.
        </p>
      </div>

      {/* 실제 피드 컨테이너 치수 재현 */}
      <div className="preview-feed-container custom-scrollbar">
        <MockVideo label="영상 1" />
        <MockVideo label="영상 2" />
        <MockVideo label="영상 3" />
        <MockVideo label="영상 4" />
        {/* 4개 뒤 광고 슬롯 #1 — 로테이션 첫 네트워크 */}
        <div className="preview-section">
          <ExternalAdSlot index={0} className="h-full" />
        </div>
        <MockVideo label="영상 5" />
        <MockVideo label="영상 6" />
        <MockVideo label="영상 7" />
        <MockVideo label="영상 8" />
        {/* 광고 슬롯 #2 — 로테이션 두번째 네트워크(있으면) */}
        <div className="preview-section">
          <ExternalAdSlot index={1} className="h-full" />
        </div>
      </div>

      <style>{`
        .preview-feed-container {
          height: calc(100dvh - 136px);
          overflow-y: auto;
          scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch;
          background: #0a0a0a;
        }
        .preview-section {
          height: calc(50% - 1.5px);
          scroll-snap-align: start;
          box-sizing: border-box;
          background: #0a0a0a;
          position: relative;
        }
        .preview-section::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent 0%, #4f46e5 15%, #8b5cf6 40%, #06b6d4 65%, #8b5cf6 85%, transparent 100%);
          box-shadow: 0 0 10px rgba(139,92,246,0.7), 0 0 20px rgba(6,182,212,0.3);
          z-index: 50;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 0px; }
      `}</style>
    </div>
  );
}
