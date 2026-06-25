// ════════════════════════════════════════════════════════════════════════════
// Bunny Stream TUS 업로드 (R1, 2026-06-11)
//
// 기존엔 Edge Function 이 라이브러리 API Key 를 클라이언트에 내려줘 직접 PUT 했는데,
// 그 키로 라이브러리 전체 영상을 삭제/변조할 수 있어 제거함.
// 대신 서버가 만들어 준 presigned 서명(SHA256(libraryId+apiKey+expire+videoId))으로
// Bunny TUS 엔드포인트에 업로드한다. 키는 절대 클라이언트로 오지 않음.
//
// TUS 흐름: ① POST /tusupload (Upload-Length) → Location 헤더로 업로드 URL 수신
//           ② 해당 URL 에 PATCH 로 파일 본문 전송 (XHR — 진행률 이벤트 제공)
// ════════════════════════════════════════════════════════════════════════════

const TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";

export interface BunnyTusAuth {
  videoId: string;
  libraryId: string;
  tusSignature: string;
  tusExpire: number;
}

export async function tusUploadToBunny(
  file: File | Blob,
  auth: BunnyTusAuth,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new Error("업로드가 취소됐습니다.");
  const authHeaders: Record<string, string> = {
    AuthorizationSignature: auth.tusSignature,
    AuthorizationExpire: String(auth.tusExpire),
    VideoId: auth.videoId,
    LibraryId: auth.libraryId,
  };

  // ① 업로드 세션 생성
  const createRes = await fetch(TUS_ENDPOINT, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(file.size),
      "Upload-Metadata": `filetype ${btoa((file as File).type || "video/mp4")}`,
    },
    signal,
  });
  if (createRes.status !== 201) {
    const text = await createRes.text().catch(() => "");
    throw new Error(`Bunny TUS 세션 생성 실패 (${createRes.status}) ${text}`);
  }
  const location = createRes.headers.get("Location");
  if (!location) {
    throw new Error("Bunny TUS Location 헤더 없음");
  }
  const uploadUrl = new URL(location, TUS_ENDPOINT).toString();

  // ② 파일 본문 PATCH (XHR — 진행률)
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 204 || xhr.status === 200) {
        resolve();
      } else {
        reject(new Error(`업로드 실패 (status ${xhr.status})`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("네트워크 에러로 업로드가 중단됐습니다.")));
    xhr.addEventListener("abort", () => reject(new Error("업로드가 취소됐습니다.")));

    // 언마운트/취소 신호 시 전송 중단 (대용량 백그라운드 전송 방지)
    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.open("PATCH", uploadUrl);
    for (const [k, v] of Object.entries(authHeaders)) xhr.setRequestHeader(k, v);
    xhr.setRequestHeader("Tus-Resumable", "1.0.0");
    xhr.setRequestHeader("Upload-Offset", "0");
    xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
    xhr.send(file);
  });
}
