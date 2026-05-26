// ════════════════════════════════════════════════════════════════════════════
// 크리에이터 스폰서십 검수 (Placeholder — 2026-05-26)
//
// Phase 28 에서 추가한 영상 협찬 기능:
//   - videos.sponsor_brand (협찬 브랜드명)
//   - videos.sponsor_logo_url
//   - videos.sponsor_disclosure (공시 문구)
//   - videos.sponsor_link_url (클릭 시 이동 URL)
//
// 향후 어드민 기능:
//   - 협찬 등록된 영상 목록
//   - 공시 문구 적정성 검수 (광고 표시 강제)
//   - 브랜드 위장·misleading 검토
//   - 거부/승인 처리 + 크리에이터 통지
//
// 현재는 placeholder. 협찬 영상 누적 후 검수 UI 본격 구현.
// ════════════════════════════════════════════════════════════════════════════
import { Sparkles, Award, AlertTriangle } from "lucide-react";

export function AdminSponsorships() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
        <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">크리에이터 스폰서십 검수</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          크리에이터가 영상에 등록한 협찬·스폰서 정보를 검수하는 화면입니다.
          공시 문구 적정성·브랜드 위장 검토·승인 처리를 담당합니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Award className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="font-bold">검수 대상</h3>
              <p className="text-xs text-muted-foreground">Phase 28 sponsor_* 데이터</p>
            </div>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
            <li>협찬 브랜드명 (sponsor_brand)</li>
            <li>브랜드 로고 (sponsor_logo_url)</li>
            <li>공시 문구 (sponsor_disclosure)</li>
            <li>클릭 이동 URL (sponsor_link_url)</li>
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-bold">검토 항목</h3>
              <p className="text-xs text-muted-foreground">공정거래법 준수</p>
            </div>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
            <li>공시 문구 명확성 ("협찬"·"광고" 표시)</li>
            <li>브랜드 위장·오인 방지</li>
            <li>금지 카테고리 (담배/주류 미성년 노출)</li>
            <li>링크 안전성 (피싱·사기 사이트)</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-5">
        <h3 className="font-bold mb-2 text-sm">활성화 시점</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          현재는 협찬 등록 영상이 누적되기 전이라 placeholder 상태입니다.
          영상 업로드 시 협찬 정보를 입력할 수 있는 폼은 이미 구현되어 있으며 (Upload·VideoEditModal),
          누적 데이터가 일정 수준 이상이 되면 검수 큐·이력 관리·승인/거부 흐름을 본격 구현 예정.
        </p>
      </div>
    </div>
  );
}
