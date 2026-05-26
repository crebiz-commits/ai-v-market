// ════════════════════════════════════════════════════════════════════════════
// 외부 광고 관리 (Placeholder — 2026-05-26)
//
// 향후 통합 예정:
//   - Google AdSense (피드 슬라이드 4번째 자리 등)
//   - 쿠팡 파트너스 (구매 전환 광고)
//   - 다른 광고 네트워크
//
// 현재는 임시 placeholder. 베타 운영 안정화 + 트래픽 검증 후 실제 통합.
// 메모리 참조: project_advertiser_self_service_pending.md
// ════════════════════════════════════════════════════════════════════════════
import { Globe, ExternalLink } from "lucide-react";

export function AdminExternalAds() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
        <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">외부 광고 통합</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          Google AdSense, 쿠팡 파트너스 등 외부 광고 네트워크 통합 화면입니다.
          베타 운영 안정화 후 실제 연동 예정입니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-bold">Google AdSense</h3>
              <p className="text-xs text-muted-foreground">디스플레이 광고 · 비디오 광고</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            피드 슬라이드 4번째 자리에 AdSense 광고 슬롯 노출. 광고 단가 자동 입찰.
          </p>
          <span className="inline-block px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold">
            준비 중 · 베타 후 통합
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <ExternalLink className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h3 className="font-bold">쿠팡 파트너스</h3>
              <p className="text-xs text-muted-foreground">제휴 마케팅 · 구매 전환</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            영상 내용과 매칭되는 쿠팡 상품 추천. 구매 전환 시 수수료 수익.
          </p>
          <span className="inline-block px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold">
            준비 중 · 베타 후 통합
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-5">
        <h3 className="font-bold mb-2 text-sm">통합 로드맵</h3>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-5">
          <li>베타 운영 시작 + 트래픽 1만 MAU 이상 확보</li>
          <li>광고 단가 평가 (자체 광고 CPM vs 외부 네트워크 비교)</li>
          <li>AdSense 승인 신청 + 정책 검토</li>
          <li>피드 슬라이드 4번째 자리에 AdSense 슬롯 통합</li>
          <li>쿠팡 파트너스 API 연동 + 카테고리별 자동 추천</li>
        </ol>
      </div>
    </div>
  );
}
