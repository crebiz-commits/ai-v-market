// ════════════════════════════════════════════════════════════════════════════
// 광고 영상(프리롤) Bunny 업로드 — 광고주 셀프서비스
//   기존 영상 업로드 흐름(create-upload Edge + TUS presigned) 재사용.
//   광고는 save-metadata 를 호출하지 않음 — Bunny 영상만 만들고 HLS URL 을 광고에 사용.
// ════════════════════════════════════════════════════════════════════════════
import { supabase, supabaseUrl, supabaseAnonKey } from "./supabaseClient";
import { tusUploadToBunny } from "./bunnyUpload";
import { BUNNY_HOST } from "./bunnyHost";

export async function uploadAdVideo(
  file: File,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<{ videoUrl: string; thumbnailUrl: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다");

  // 1) Bunny 영상 객체 생성 + TUS presigned 서명 (라이브러리 키는 클라이언트로 안 옴)
  const res = await fetch(`${supabaseUrl}/functions/v1/server/videos/create-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
    body: JSON.stringify({ title: file.name }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `영상 생성 실패 (${res.status})`);
  }
  const { videoId, libraryId, tusSignature, tusExpire } = await res.json();

  // 2) Bunny 로 직접 TUS 업로드 (signal 로 중단 가능 — 모달 닫으면 취소)
  await tusUploadToBunny(file, { videoId, libraryId, tusSignature, tusExpire }, (loaded, total) => {
    if (onProgress && total > 0) onProgress(Math.round((loaded / total) * 100));
  }, signal);

  return {
    videoUrl: `https://${BUNNY_HOST}/${videoId}/playlist.m3u8`,
    thumbnailUrl: `https://${BUNNY_HOST}/${videoId}/thumbnail.jpg`,
  };
}
