import { CreaiteText } from "./CreaiteText";

function HeaderMockup({ label, desc, logoSrc, textSize, logoSize }: {
  label: string;
  desc: string;
  logoSrc: string;
  textSize: string;
  logoSize: string;
}) {
  return (
    <div className="bg-[#111] rounded-2xl p-5 border border-white/10">
      <h3 className="font-bold mb-1 text-white">{label}</h3>
      <p className="text-xs text-gray-400 mb-4 h-8">{desc}</p>
      <div className="bg-background/80 backdrop-blur-xl border border-white/5 rounded-xl px-4 h-14 flex items-center">
        <div className="flex items-center gap-2">
          <img src={logoSrc} alt="logo" className={`${logoSize} w-auto object-contain drop-shadow-sm`} />
          <CreaiteText className={textSize} />
        </div>
      </div>
    </div>
  );
}

function SplashMockup({ logoSrc }: { logoSrc: string }) {
  return (
    <div className="bg-[#111] rounded-2xl p-5 border border-white/10">
      <h3 className="font-bold mb-1 text-white">스플래시 화면</h3>
      <p className="text-xs text-gray-400 mb-4">앱 첫 진입 시 표시되는 화면</p>
      <div className="bg-background border border-white/10 rounded-xl py-8 flex flex-col items-center">
        <div className="w-32 h-32 mb-4 flex items-center justify-center">
          <img src={logoSrc} alt="logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="mb-2">
          <CreaiteText className="text-4xl font-extrabold" />
        </h1>
        <p className="text-muted-foreground text-sm">AI 영상 특화 오픈마켓</p>
      </div>
    </div>
  );
}

export function NewLogoPreview() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">새 로고 적용 미리보기</h1>
        <p className="text-gray-400 mb-8">
          기존 logo.png vs 새 로고 (KakaoTalk_20260429_175134236.png) 비교
        </p>

        {/* 새 로고 단독 보기 */}
        <div className="bg-[#111] rounded-2xl p-6 border border-white/10 mb-8 flex items-center justify-around gap-8 flex-wrap">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-2">기존 (logo.png)</p>
            <img src="/logo.png" alt="old" className="w-24 h-24 object-contain mx-auto" />
          </div>
          <div className="text-center">
            <p className="text-xs text-yellow-400 mb-2">★ 새 로고</p>
            <img src="/logo-new.png" alt="new" className="w-24 h-24 object-contain mx-auto" />
          </div>
        </div>

        {/* 모바일 헤더 비교 */}
        <h2 className="text-xl font-bold mb-3 mt-8">모바일 헤더</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <HeaderMockup
            label="기존 logo.png"
            desc="현재 사이트 모바일 헤더"
            logoSrc="/logo.png"
            textSize="text-[17px] font-extrabold"
            logoSize="h-9"
          />
          <HeaderMockup
            label="★ 새 로고"
            desc="새 로고 적용 시"
            logoSrc="/logo-new.png"
            textSize="text-[17px] font-extrabold"
            logoSize="h-9"
          />
        </div>

        {/* 데스크탑 헤더 비교 */}
        <h2 className="text-xl font-bold mb-3 mt-8">데스크탑 헤더</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <HeaderMockup
            label="기존 logo.png"
            desc="현재 사이트 데스크탑 헤더"
            logoSrc="/logo.png"
            textSize="text-xl font-extrabold"
            logoSize="h-10"
          />
          <HeaderMockup
            label="★ 새 로고"
            desc="새 로고 적용 시"
            logoSrc="/logo-new.png"
            textSize="text-xl font-extrabold"
            logoSize="h-10"
          />
        </div>

        {/* 스플래시 화면 비교 */}
        <h2 className="text-xl font-bold mb-3 mt-8">스플래시 화면</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <SplashMockup logoSrc="/logo.png" />
          <SplashMockup logoSrc="/logo-new.png" />
        </div>

        <div className="mt-12 p-6 bg-[#111] rounded-2xl border border-white/10">
          <h2 className="text-xl font-bold mb-3">적용할까요?</h2>
          <p className="text-gray-400 text-sm">
            마음에 드시면 "적용해줘"라고 말씀해 주세요. <br />
            적용 시 기존 logo.png를 새 로고로 교체합니다 (코드 수정 없이 이미지 파일만 교체).
          </p>
        </div>
      </div>
    </div>
  );
}
