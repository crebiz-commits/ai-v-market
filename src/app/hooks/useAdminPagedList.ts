// ════════════════════════════════════════════════════════════════════════════
// 관리자 "상태 필터 + 페이지네이션" 목록 공용 훅 (2026-07-19)
//
//   고객문의(support_inquiries) / 버그제보(bug_reports) / 비즈문의(business_inquiries)
//   세 화면이 완전히 같은 구조라 공용화. 전부 `.limit(300)` 류 하드캡만 있고 더보기가 없어
//   상한을 넘은 항목이 관리자에게 **영구히 보이지 않던** 데이터 유실 상태였음.
//
//   ★ 필터·카운트를 반드시 서버로 보낸다
//     기존 코드는 items 를 전부 받아와 클라이언트에서 filter/count 했다. 페이지네이션만
//     넣고 이걸 두면
//       ① 배지의 "접수됨 12" 가 '현재 페이지 안에서 12건' 이라는 엉뚱한 뜻이 되고
//       ② 30건 페이지에서 필터를 걸면 3건만 남는 등 필터가 사실상 동작하지 않는다.
//     → status 필터는 .eq() 로 서버에, 배지 카운트는 별도 head count 로 전체 기준 집계.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";

interface Options<S extends string> {
  table: string;                 // 조회 테이블
  select: string;                // select 컬럼 목록
  statuses: readonly S[];        // 배지에 표시할 상태값들
  orderColumn?: string;          // 정렬 기준(기본 created_at DESC)
  pageSize?: number;             // 초기 페이지 크기
  errorLabel?: string;           // 토스트 문구용 ("문의", "버그 제보" 등)
}

export function useAdminPagedList<T, S extends string>({
  table, select, statuses, orderColumn = "created_at", pageSize: initialPageSize = 30, errorLabel = "목록",
}: Options<S>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | S>("all");
  const [page, setPage] = useState(0);            // 0-indexed
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  const [total, setTotal] = useState(0);          // 현재 필터 기준 전체 건수
  const [loadError, setLoadError] = useState(false);   // 조회 실패 — "데이터 없음"과 구분(빈 화면 오인 방지)
  const [counts, setCounts] = useState<Record<string, number>>({});   // 상태별 전체 건수(배지)
  const [totalAll, setTotalAll] = useState(0);    // 필터 무관 전체 건수('전체' 배지)

  // 페이지·필터를 빠르게 바꾸면 이전 요청이 나중에 도착해 화면을 덮을 수 있음 → 최신 요청만 반영
  const reqSeq = useRef(0);
  const countSeq = useRef(0);

  // ── 목록(현재 페이지) ──
  const loadPage = useCallback(async (targetPage: number) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    const from = targetPage * pageSize;
    let q = supabase
      .from(table)
      .select(select, { count: "exact" })
      .order(orderColumn, { ascending: false })
      .range(from, from + pageSize - 1);
    if (filter !== "all") q = q.eq("status", filter);

    const { data, error, count } = await q;
    if (seq !== reqSeq.current) return;   // 낡은 응답 폐기

    if (error) {
      // PostgREST 는 범위 밖 range 요청에 416(PGRST103)을 던진다. 다른 관리자가 처리해
      //   건수가 줄면 현재 페이지가 범위를 벗어날 수 있으므로, 에러가 아니라 첫 페이지로 자가복구.
      //   (실패로 처리하면 "조회 실패" 토스트 + 빈 목록에 갇혀 되돌아올 방법이 없음)
      if (error.code === "PGRST103" && targetPage > 0) {
        setLoading(false);
        void loadPage(targetPage - 1);   // 1페이지로 튕기지 않고 바로 앞 페이지로(감사 중이던 위치 보존)
        return;
      }
      console.warn(`[useAdminPagedList] ${table} 조회 실패:`, error.message);
      toast.error(`${errorLabel} 조회 실패: ` + error.message);
      setItems([]);
      setLoadError(true);   // 화면에 "아직 없습니다" 대신 재시도 안내를 띄우기 위함
      setLoading(false);
      return;
    }

    const rows = (data || []) as T[];
    const exact = count ?? 0;
    // 빈 응답(에러 없이)으로 범위를 벗어난 경우도 동일하게 첫 페이지로 복구
    if (rows.length === 0 && targetPage > 0 && exact > 0) {
      setLoading(false);
      void loadPage(targetPage - 1);   // 〃
      return;
    }
    setItems(rows);
    setTotal(exact);
    setPage(targetPage);
    setLoadError(false);
    setLoading(false);
  }, [table, select, orderColumn, pageSize, filter, errorLabel]);

  // ── 상태별 배지 카운트(전체 기준) ──
  //    페이지네이션 후엔 클라이언트가 전체를 셀 수 없으므로 head count 로 서버 집계.
  //    목록 조회와 분리 — 페이지 이동마다 다시 셀 필요가 없다(데이터 변경 시에만 갱신).
  const refreshCounts = useCallback(async () => {
    const seq = ++countSeq.current;   // 연속 상태변경 시 낡은 카운트 응답이 최신 값을 덮는 것 방지
    const results = await Promise.all([
      supabase.from(table).select("id", { count: "exact", head: true }),
      ...statuses.map((s) =>
        supabase.from(table).select("id", { count: "exact", head: true }).eq("status", s),
      ),
    ]);
    if (seq !== countSeq.current) return;   // 더 새로운 카운트 요청이 진행 중 → 폐기
    const [allRes, ...statusRes] = results;
    if (allRes.error) return;   // 카운트는 부가정보 — 실패해도 목록은 유지(토스트 중복 방지)
    setTotalAll(allRes.count ?? 0);
    const next: Record<string, number> = {};
    statuses.forEach((s, i) => { next[s] = statusRes[i]?.count ?? 0; });
    setCounts(next);
  }, [table, statuses]);

  // 필터·페이지 크기 변경 시 첫 페이지로 리셋
  useEffect(() => { void loadPage(0); }, [loadPage]);
  useEffect(() => { void refreshCounts(); }, [refreshCounts]);

  // 상태 변경·삭제 후 호출 — 현재 페이지 + 배지 동시 갱신
  const reload = useCallback(() => {
    void loadPage(page);
    void refreshCounts();
  }, [loadPage, page, refreshCounts]);

  // 항목의 status 를 바꾼 뒤 호출. 필터가 걸려 있으면 그 항목은 더 이상 이 목록에 속하지 않으므로
  //   페이지를 다시 받아야 한다(낙관적 갱신만 하면 "신규" 필터에 "검토중" 배지가 남고 total 도 낡음).
  //   전체 보기에서는 멤버십이 안 바뀌므로 배지만 다시 센다.
  const afterStatusChange = useCallback(() => {
    if (filter !== "all") void loadPage(page);
    void refreshCounts();
  }, [filter, loadPage, page, refreshCounts]);

  return {
    items, setItems, loading,
    filter, setFilter,
    page, pageSize, setPageSize,
    total, totalAll, counts, loadError,
    hasMore: (page + 1) * pageSize < total,
    goToPage: loadPage,
    reload, refreshCounts, afterStatusChange,
  };
}
