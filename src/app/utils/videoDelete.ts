// ════════════════════════════════════════════════════════════════════════════
// 영상 삭제 — DB 행 + Bunny 원본을 함께 지운다 (2026-07-22)
//
//   [배경] 삭제 RPC(delete_my_video / admin_delete_video)는 SQL 이라 Bunny API 를
//     호출할 수 없고, Edge 어디에도 Bunny 삭제 호출이 없었다. 그래서 **화면에서만
//     사라지고 원본은 Bunny 에 영구 잔존**했다(실측: 고아 3편 1.25GB, 직링크 접근 가능).
//     저작권 내림·가이드라인 위반 삭제·개인정보 파기 요구가 실제로 이행되지 않는 상태.
//
//   [설계] Edge /video-delete 가 "권한검증 → RPC(기존 가드 그대로) → Bunny 삭제" 를
//     한 트랜잭션처럼 처리한다. 순서가 중요하다 — RPC 로 행이 사라지면 소유자도
//     hero_clip_id 도 알 수 없기 때문.
//
//   ▣ **폴백**: Edge 가 응답하지 않으면 기존처럼 RPC 를 직접 호출한다.
//     삭제 기능 자체가 Edge 가용성에 묶이면 안 되기 때문. 이 경우 Bunny 에 파일이
//     남지만, scripts/bunny-orphan-cleanup.mjs 가 나중에 회수한다.
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabaseClient";

const ENDPOINT =
  "https://tvbpiuwmvrccfnplhwer.supabase.co/functions/v1/server/video-delete";
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";

export type DeleteMode = "creator" | "admin";

export interface DeleteResult {
  error: string | null;
  /** Bunny 원본까지 지워졌는지 — false 면 고아로 남아 정리 스크립트 대상 */
  bunnyRemoved: boolean;
}

/**
 * 영상을 삭제한다. 권한 검증과 판매이력 가드는 서버 RPC 가 그대로 수행한다.
 * @param mode 'creator' = 본인 영상(delete_my_video) / 'admin' = 관리자(admin_delete_video)
 */
export async function deleteVideoEverywhere(
  videoId: string,
  mode: DeleteMode,
): Promise<DeleteResult> {
  const rpcName = mode === "admin" ? "admin_delete_video" : "delete_my_video";

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ videoId, mode }),
    });
    const body = await res.json().catch(() => ({}));

    if (res.ok && body?.ok) {
      return { error: null, bunnyRemoved: !(body.failed?.length > 0) };
    }
    // 서버가 거부한 경우(판매이력·권한 등)는 그 사유를 그대로 전달 — 폴백하면 안 된다.
    //   (RPC 가 이미 실행돼 실패한 것이므로 재시도는 같은 결과)
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
      return { error: body?.error || "삭제할 수 없습니다", bunnyRemoved: false };
    }
    throw new Error(body?.error || `HTTP ${res.status}`);
  } catch {
    // Edge 장애 등 → 기존 경로로 폴백. DB 는 지워지고 Bunny 파일만 고아로 남는다.
    const { error } = await supabase.rpc(rpcName, { p_video_id: videoId });
    return { error: error?.message ?? null, bunnyRemoved: false };
  }
}
