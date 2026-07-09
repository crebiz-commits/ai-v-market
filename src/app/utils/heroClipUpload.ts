// ════════════════════════════════════════════════════════════════════════════
// OTT 히어로 미리보기 클립 Bunny 업로드 (방식 C — 검수 파이프라인 재활용)
//   클립도 본편과 동일하게 Bunny(create-upload + TUS)에 올려 인코딩 → Bunny 실제 썸네일을
//   서버 Vision 검수(webhook / moderate-hero-clip). 반환한 clipId(=Bunny GUID)를 save-metadata
//   로 넘기면 서버가 hero_clip_id 로 저장하고 검수 대기(pending)로 둔다.
// ════════════════════════════════════════════════════════════════════════════
import { supabase, supabaseUrl, supabaseAnonKey } from "./supabaseClient";
import { tusUploadToBunny } from "./bunnyUpload";
import { BUNNY_HOST } from "./bunnyHost";

export async function uploadHeroClip(
  file: File,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<{ clipId: string; clipUrl: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다");

  // 1) Bunny 영상 객체 생성 + TUS presigned 서명 (본편 업로드와 동일 엔드포인트)
  const res = await fetch(`${supabaseUrl}/functions/v1/server/videos/create-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
    body: JSON.stringify({ title: `hero-clip-${file.name}` }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `클립 생성 실패 (${res.status})`);
  }
  const { videoId, libraryId, tusSignature, tusExpire } = await res.json();

  // 2) Bunny 로 직접 TUS 업로드 (signal 로 중단 가능)
  await tusUploadToBunny(file, { videoId, libraryId, tusSignature, tusExpire }, (loaded, total) => {
    if (onProgress && total > 0) onProgress(Math.round((loaded / total) * 100));
  }, signal);

  return { clipId: videoId, clipUrl: `https://${BUNNY_HOST}/${videoId}/playlist.m3u8` };
}
