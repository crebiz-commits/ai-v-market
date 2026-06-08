// 개발자 전용 미리보기: "지금 뜨는 시네마" 순위 표시 디자인 비교 (?preview=trending-rank)
import { Film } from "lucide-react";

const BRAND = "from-[#a78bfa] via-[#ec4899] to-[#f59e0b]";

// 샘플 포스터(그라데이션 + 아이콘) — 실제 썸네일 대신
function Poster({ i, w = "w-full" }: { i: number; w?: string }) {
  const grads = [
    "from-[#1e3a8a] to-[#0d0d14]",
    "from-[#7c2d12] to-[#0d0d14]",
    "from-[#14532d] to-[#0d0d14]",
    "from-[#581c87] to-[#0d0d14]",
    "from-[#831843] to-[#0d0d14]",
  ];
  return (
    <div className={`relative ${w} aspect-[2/3] rounded-lg overflow-hidden shadow-xl bg-gradient-to-br ${grads[i % grads.length]} flex items-center justify-center`}>
      <Film className="w-8 h-8 text-white/30" />
      <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
    </div>
  );
}

function neonStyle(rank: number) {
  if (rank === 1) return { color: "#fde047", glow: "0 0 8px #fde047, 0 0 18px #facc15, 0 0 34px #f59e0b" };
  if (rank === 2) return { color: "#fbbf24", glow: "0 0 8px #fbbf24, 0 0 16px #fbbf24, 0 0 32px #fbbf24" };
  if (rank === 3) return { color: "#22d3ee", glow: "0 0 8px #22d3ee, 0 0 16px #22d3ee, 0 0 32px #22d3ee" };
  return { color: "#a78bfa", glow: "0 0 6px #a78bfa, 0 0 14px #a78bfa" };
}

export function TrendingRankPreview() {
  const ranks = [1, 2, 3, 4];
  return (
    <div className="h-screen overflow-y-auto bg-[#0a0a0a] text-white p-6 space-y-12">
      <div>
        <h1 className="text-lg font-black">"지금 뜨는 시네마" 순위 표시 — 디자인 비교</h1>
        <p className="text-white/50 text-xs mt-1">현재(A) vs 더 획기적인 안들. 마음에 드는 안을 골라주세요.</p>
      </div>

      {/* A — 현재: 좌하단 네온 숫자 */}
      <section>
        <p className="text-[#c4b5fd] text-xs font-bold mb-3">A. 현재 — 좌하단 네온 숫자</p>
        <div className="flex gap-3">
          {ranks.map((r, i) => {
            const n = neonStyle(r);
            return (
              <div key={r} className="relative w-[120px]">
                <Poster i={i} />
                <span className="absolute bottom-2 left-2 text-4xl font-black leading-none italic" style={{ color: n.color, textShadow: n.glow }}>{r}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* B — 넷플릭스식 거대 외곽선 숫자(포스터가 겹침) */}
      <section>
        <p className="text-[#c4b5fd] text-xs font-bold mb-3">B. 넷플릭스 Top10 식 — 거대 외곽선 숫자 + 포스터 겹침</p>
        <div className="flex gap-1">
          {ranks.map((r, i) => (
            <div key={r} className="flex items-end">
              <span
                className="font-black italic leading-[0.7] select-none"
                style={{ fontSize: "150px", color: "transparent", WebkitTextStroke: "3px rgba(255,255,255,0.9)" }}
              >
                {r}
              </span>
              <Poster i={i} w="w-[110px] -ml-9" />
            </div>
          ))}
        </div>
      </section>

      {/* C — 거대 그라데이션 채움 숫자(포스터 겹침) */}
      <section>
        <p className="text-[#c4b5fd] text-xs font-bold mb-3">C. 거대 브랜드 그라데이션 숫자 + 포스터 겹침</p>
        <div className="flex gap-1">
          {ranks.map((r, i) => (
            <div key={r} className="flex items-end">
              <span
                className={`font-black italic leading-[0.7] select-none text-transparent bg-clip-text bg-gradient-to-b ${BRAND} drop-shadow-[0_4px_12px_rgba(236,72,153,0.4)]`}
                style={{ fontSize: "150px" }}
              >
                {r}
              </span>
              <Poster i={i} w="w-[110px] -ml-8" />
            </div>
          ))}
        </div>
      </section>

      {/* D — 포스터 안 하단에 거대 숫자(외곽선+그라데이션), 별도 공간 없이 */}
      <section>
        <p className="text-[#c4b5fd] text-xs font-bold mb-3">D. 포스터 안 — 하단 거대 숫자(그라데이션 채움 + 흰 외곽선)</p>
        <div className="flex gap-3">
          {ranks.map((r, i) => (
            <div key={r} className="relative w-[120px]">
              <Poster i={i} />
              <span
                className={`absolute -bottom-3 left-1 font-black italic leading-[0.7] text-transparent bg-clip-text bg-gradient-to-b ${BRAND}`}
                style={{ fontSize: "96px", WebkitTextStroke: "2px rgba(255,255,255,0.85)" }}
              >
                {r}
              </span>
            </div>
          ))}
        </div>
      </section>

      <p className="text-white/40 text-xs">※ 포스터는 샘플(그라데이션)입니다. 실제론 영상 썸네일이 들어갑니다.</p>
    </div>
  );
}
