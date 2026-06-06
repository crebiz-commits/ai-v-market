// ════════════════════════════════════════════════════════════════════════════
// Showcase Mode 토글 + 헬퍼
//
// 베타 오픈 시 SHOWCASE_ENABLED = false 한 줄만 변경하면 모든 Mock 사라짐.
// 관리자(profile.is_admin)는 항상 Mock 안 보임 (실제 데이터 검증 가능).
// ════════════════════════════════════════════════════════════════════════════
import { toast } from "sonner";
import { SHOWCASE_VIDEOS, isShowcaseId, type ShowcaseVideo } from "../data/showcaseVideos";

/** 베타 오픈 시 false로 변경 → 모든 Mock 데이터 사라짐 (2026-06-06: 실제 시드 146편 등록으로 OFF) */
export const SHOWCASE_ENABLED = false;

export { isShowcaseId };

/**
 * 관리자 여부에 따라 showcase 활성 결정.
 * 컴포넌트에서: const showcase = shouldShowShowcase(profile?.is_admin)
 */
export function shouldShowShowcase(isAdmin: boolean | null | undefined): boolean {
  if (!SHOWCASE_ENABLED) return false;
  if (isAdmin === true) return false;
  return true;
}

/**
 * 실제 영상 배열 + Mock 영상 합치기.
 * 같은 카테고리/조건의 Mock을 적절히 끼워넣음 (실제가 위, Mock이 뒤).
 *
 * @param real 실제 영상 (이미 fetch된 것)
 * @param transform 각 ShowcaseVideo를 호출자 컴포넌트의 영상 모델로 변환하는 함수
 * @param opts.category 특정 카테고리만
 * @param opts.maxShowcase 최대 표시 개수 (기본 100)
 * @param opts.tier "cinema" / "ott" 등 길이 기반 필터 (선택)
 */
export function mergeShowcase<T>(
  real: T[],
  transform: (v: ShowcaseVideo) => T,
  opts?: { category?: string; maxShowcase?: number; tier?: "cinema" | "ott" | "shorts" }
): T[] {
  const max = opts?.maxShowcase ?? 100;
  let pool = SHOWCASE_VIDEOS;

  if (opts?.category && opts.category !== "all" && opts.category !== "전체") {
    pool = pool.filter((v) => v.category === opts.category);
  }
  if (opts?.tier === "cinema") {
    // 시네마: 3분 이상
    pool = pool.filter((v) => v.durationSeconds >= 180);
  } else if (opts?.tier === "ott") {
    // OTT: 10분 이상
    pool = pool.filter((v) => v.durationSeconds >= 600);
  } else if (opts?.tier === "shorts") {
    // 숏폼: 1분 미만
    pool = pool.filter((v) => v.durationSeconds < 60);
  }

  pool = pool.slice(0, max);
  const transformed = pool.map(transform);
  return [...real, ...transformed];
}

/**
 * Showcase 영상 클릭/액션 시 안내 + 차단.
 * 컴포넌트에서:
 *   if (handleShowcaseClick(videoId)) return;
 *   // 그 외 정상 처리
 */
export function handleShowcaseClick(videoId: string | undefined | null): boolean {
  if (!isShowcaseId(videoId)) return false;
  toast.info("곧 공개될 예정인 영상입니다 ✨", {
    description: "베타 오픈 후 만나보실 수 있어요.",
  });
  return true;
}
