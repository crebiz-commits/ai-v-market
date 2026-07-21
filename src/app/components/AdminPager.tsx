// ════════════════════════════════════════════════════════════════════════════
// 관리자 목록 공용 페이저 — 30/50/100개씩 + 이전/다음
//   AdminActivityLog 에서 검증된 마크업을 공용화(2026-07-19). 끝없는 스크롤/append 대신
//   페이지 이동(replace) — 관리자는 "몇 번째 페이지에서 봤다"가 재현돼야 하기 때문.
// ════════════════════════════════════════════════════════════════════════════
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";

export const PAGE_SIZES = [30, 50, 100] as const;

interface AdminPagerProps {
  page: number;                       // 0-indexed
  pageSize: number;
  hasMore: boolean;
  loading?: boolean;
  total?: number | null;              // 알면 "1–30 / 412" 범위 표시
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function AdminPager({
  page, pageSize, hasMore, loading = false, total = null, onPageChange, onPageSizeChange,
}: AdminPagerProps) {
  // 한 페이지뿐이면 페이저 자체를 숨긴다 — 1건짜리 목록에 '이전/다음'은 의미가 없다.
  //   ⚠️ 단 페이지 크기를 이미 키워둔 상태(예: 100)에서 40건이면 hasMore 가 false 라
  //      그대로 숨기면 30 으로 되돌릴 수단이 사라진다 → 기본 크기일 때만 숨긴다.
  //   총건수를 모르는 화면(total=null)은 hasMore 로만 판단.
  //   총건수를 알면 "가장 작은 페이지 크기로도 한 페이지"일 때만 숨긴다 → 크기를 키워둔 상태에서
  //   되돌릴 수단이 사라지는 함정도 막고, 기본 크기가 30이 아닌 화면(정산=50)에서도 의도대로 동작.
  const singlePage =
    page === 0 && !hasMore &&
    (total != null ? total <= PAGE_SIZES[0] : pageSize === PAGE_SIZES[0]);
  if (singlePage) return null;

  const from = page * pageSize + 1;
  const to = total != null ? Math.min((page + 1) * pageSize, total) : (page + 1) * pageSize;

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 pt-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>페이지당</span>
        {PAGE_SIZES.map((sz) => (
          <button
            key={sz}
            onClick={() => onPageSizeChange(sz)}
            aria-pressed={pageSize === sz}
            disabled={loading}
            className={`px-2 py-1 rounded font-semibold transition-colors disabled:opacity-50 ${
              pageSize === sz ? "bg-[#6366f1] text-white" : "bg-muted hover:bg-muted/70"
            }`}
          >{sz}</button>
        ))}
        <span>개</span>
        {total != null && total > 0 && (
          <span className="ml-2 tabular-nums">· {from}–{to} / {total}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)}
          disabled={loading || page === 0} className="gap-1">
          <ChevronLeft className="w-4 h-4" />이전
        </Button>
        <span className="text-xs text-muted-foreground min-w-[3.5rem] text-center">{page + 1} 페이지</span>
        <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)}
          disabled={loading || !hasMore} className="gap-1">
          다음<ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
