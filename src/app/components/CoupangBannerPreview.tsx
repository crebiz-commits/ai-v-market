// 개발자 전용 미리보기: 쿠팡파트너스 보조 배너가 푸터/마이페이지에 들어간 모습 (?preview=coupang)
// ※ 실제 쿠팡 다이나믹 배너(회전형 상품 위젯)는 쿠팡 스크립트가 렌더 — 여기선 시각 목업 + 필수 고지 문구.
import { ShoppingBag, Star, ChevronRight, Home, Film, Crown, MessageSquare, Users, User } from "lucide-react";

// ── 공정위 대가성 고지 문구 (다이나믹 배너 = 사이트 하단 일괄 고지로 충분) ──
const DISCLOSURE =
  "이 사이트는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

// ── 쿠팡 다이나믹 배너 목업 (실제론 쿠팡이 회전형 상품 추천을 렌더) ──
function CoupangMock({ rows = 1 }: { rows?: 1 | 2 }) {
  const products = [
    { name: "무선 블루투스 이어폰 노이즈캔슬링", price: "29,900", rocket: true },
    { name: "스마트워치 실리콘 밴드 2p", price: "12,500", rocket: true },
    { name: "USB-C PD 고속충전기 65W", price: "8,900", rocket: false },
    { name: "접이식 노트북 거치대 알루미늄", price: "19,900", rocket: true },
    { name: "감성 LED 무드등 USB", price: "9,900", rocket: true },
    { name: "차량용 무선충전 거치대", price: "23,900", rocket: false },
  ];
  const list = rows === 2 ? products : products.slice(0, 4);
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f14] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <span className="text-xs font-bold flex items-center gap-1.5">
          <ShoppingBag className="w-3.5 h-3.5 text-[#ff5a5f]" />
          <span className="text-white/80">쿠팡 추천</span>
          <span className="text-[#ff5a5f] font-black">coupang</span>
        </span>
        <span className="text-[9px] font-bold text-white/30 border border-white/15 rounded px-1 py-0.5">AD</span>
      </div>
      <div className={`grid ${rows === 2 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"} gap-2 p-3`}>
        {list.map((p, i) => (
          <div key={i} className="rounded-lg bg-white/[0.03] border border-white/5 overflow-hidden">
            <div className="aspect-square bg-gradient-to-br from-white/[0.07] to-white/[0.02] flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-white/15" />
            </div>
            <div className="p-2">
              <p className="text-[11px] text-white/70 leading-tight line-clamp-2 h-[28px]">{p.name}</p>
              <div className="mt-1 flex items-center gap-1">
                {p.rocket && (
                  <span className="text-[8px] font-black text-[#3d7eff] bg-[#3d7eff]/10 rounded px-1 py-0.5">로켓배송</span>
                )}
                <span className="flex items-center gap-0.5 text-[8px] text-amber-400"><Star className="w-2 h-2 fill-amber-400" />4.8</span>
              </div>
              <p className="text-[12px] font-black text-white mt-0.5">{p.price}<span className="text-[10px] font-normal text-white/50">원</span></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Disclosure() {
  return (
    <p className="text-[10px] text-white/35 leading-relaxed mt-2 px-1">
      {DISCLOSURE}
    </p>
  );
}

export function CoupangBannerPreview() {
  return (
    <div className="h-screen overflow-y-auto bg-[#0a0a0a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-black mb-1">쿠팡파트너스 보조 배너 — 배치 미리보기</h1>
        <p className="text-sm text-white/50 mb-1">실제 배너는 쿠팡 스크립트가 <b>회전형 실제 상품</b>으로 렌더합니다. 아래는 위치·디자인 시각 목업입니다.</p>
        <p className="text-xs text-amber-400/80 mb-8">⚠️ 다이나믹 배너는 사이트 하단(또는 마이페이지)에 <b>공정위 대가성 고지 문구</b>를 함께 노출해야 합니다.</p>

        {/* ─────────── ① 푸터 버전 ─────────── */}
        <section className="mb-12">
          <h2 className="text-sm font-bold text-[#a5b4fc] mb-3">① 푸터 영역 (모든 페이지 하단)</h2>
          <div className="rounded-2xl overflow-hidden border border-white/10">
            {/* 페이지 콘텐츠 끝부분 암시 */}
            <div className="h-16 bg-gradient-to-b from-transparent to-white/[0.02] flex items-end justify-center pb-2">
              <span className="text-[10px] text-white/20">… 페이지 콘텐츠 …</span>
            </div>
            {/* 푸터 */}
            <div className="bg-[#0c0c11] border-t border-white/10 px-4 pt-5 pb-6">
              {/* 쿠팡 배너 */}
              <CoupangMock rows={1} />
              <Disclosure />
              {/* 기존 푸터 링크들 */}
              <div className="mt-5 pt-4 border-t border-white/5 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-white/40">
                <span>회사소개</span><span>이용약관</span><span>개인정보처리방침</span>
                <span>크리에이터 가이드</span><span>고객센터</span>
              </div>
              <p className="text-[10px] text-white/25 mt-3">© 2026 크레비즈 · CREAITE — 세계 최초 AI 시네마 OTT</p>
            </div>
          </div>
        </section>

        {/* ─────────── ② 마이페이지 버전 ─────────── */}
        <section className="mb-12">
          <h2 className="text-sm font-bold text-[#a5b4fc] mb-3">② 마이페이지 (프로필 아래 보조 영역)</h2>
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0c0c11] p-4">
            {/* 프로필 헤더 목업 */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#6366f1] to-[#ec4899]" />
              <div>
                <p className="font-bold">크리에잇</p>
                <p className="text-xs text-white/40">crebiz@creaite.net</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {["내 영상", "좋아요", "구매내역"].map((m) => (
                <div key={m} className="rounded-lg bg-white/[0.03] border border-white/5 py-3 text-center text-xs text-white/60">{m}</div>
              ))}
            </div>
            {/* 쿠팡 배너 — 마이페이지 하단 보조 */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white/50">추천 쇼핑</span>
              <span className="text-[10px] text-white/30 flex items-center">더보기 <ChevronRight className="w-3 h-3" /></span>
            </div>
            <CoupangMock rows={2} />
            <Disclosure />
          </div>
        </section>

        {/* ─────────── 모바일 하단 탭 위 미니배너(선택) ─────────── */}
        <section className="mb-8">
          <h2 className="text-sm font-bold text-[#a5b4fc] mb-3">③ (참고) 모바일에서의 푸터 노출 위치</h2>
          <div className="max-w-[360px] mx-auto rounded-[28px] overflow-hidden border-4 border-white/10 bg-[#0a0a0a]">
            <div className="h-40 bg-gradient-to-b from-white/[0.04] to-transparent flex items-center justify-center text-[11px] text-white/20">… 마이페이지 콘텐츠 …</div>
            <div className="px-3 pb-2"><CoupangMock rows={1} /><Disclosure /></div>
            {/* 하단 탭바 */}
            <div className="flex items-center justify-around border-t border-white/10 py-2 text-[9px] text-white/40">
              {[["홈", Home], ["시네마", Film], ["OTT", Crown], ["커뮤니티", MessageSquare], ["채널", Users], ["마이", User]].map(([label, Icon]: any, i) => (
                <div key={i} className={`flex flex-col items-center gap-0.5 ${label === "마이" ? "text-[#a5b4fc]" : ""}`}>
                  <Icon className="w-4 h-4" /><span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="text-xs text-white/40 leading-relaxed border-t border-white/10 pt-5">
          <p className="font-bold text-white/60 mb-1">실제 적용 시</p>
          <p>· 수익 모델: 노출이 아니라 <b>클릭→쿠팡 구매 시 수수료</b> (CPM 아님)</p>
          <p>· 위치: 애드핏/애드센스(CPM)와 <b>다른 자리</b>(푸터·마이페이지)에 배치 권장 — 충돌 방지</p>
          <p>· 필수: <b>공정위 고지 문구</b>(위 회색 문구)를 배너 근처에 상시 노출</p>
          <p>· 승인: 쿠팡파트너스에 creaite.net 등록만 하면 광고심사 없이 바로 시작</p>
        </div>
      </div>
    </div>
  );
}
