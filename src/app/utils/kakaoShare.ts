// ════════════════════════════════════════════════════════════════════════════
// 카카오톡 공유 SDK (env 게이트)
//   - VITE_KAKAO_JS_KEY 가 설정된 경우에만 동작. 없으면 호출부가 링크복사 폴백.
//   - SDK 스크립트는 최초 공유 시 1회 동적 로드 + init.
//   - Kakao Developers → 내 앱 → 플랫폼(Web)에 사이트 도메인 등록돼 있어야 실제 전송됨.
// ════════════════════════════════════════════════════════════════════════════

const SDK_SRC = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";

let loadPromise: Promise<boolean> | null = null;

function getKey(): string | undefined {
  return (import.meta as any).env?.VITE_KAKAO_JS_KEY || undefined;
}

/** JS 키가 설정돼 있으면 true (실제 전송 가능 여부는 도메인 등록에 따름) */
export function isKakaoConfigured(): boolean {
  return !!getKey();
}

/** SDK 로드 + init 보장. 키 없거나 로드 실패 시 false. */
async function ensureKakao(): Promise<boolean> {
  const key = getKey();
  if (!key) return false;
  const w = window as any;
  if (w.Kakao?.isInitialized?.()) return true;
  if (!loadPromise) {
    loadPromise = new Promise<boolean>((resolve) => {
      const init = () => {
        try {
          if (w.Kakao && !w.Kakao.isInitialized()) w.Kakao.init(key);
          resolve(!!w.Kakao?.isInitialized());
        } catch {
          resolve(false);
        }
      };
      if (w.Kakao) return init();
      const s = document.createElement("script");
      s.src = SDK_SRC;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.onload = init;
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }
  return loadPromise;
}

/**
 * 카카오톡으로 공유. 성공 시 true, (키 없음/로드 실패/예외) 시 false → 호출부가 폴백 처리.
 * 썸네일(imageUrl)이 있으면 feed 카드, 없으면 text 형식.
 */
export async function shareToKakao(opts: {
  title: string;
  description?: string;
  imageUrl?: string;
  link: string;
}): Promise<boolean> {
  const ok = await ensureKakao();
  if (!ok) return false;
  const K = (window as any).Kakao;
  const link = { mobileWebUrl: opts.link, webUrl: opts.link };
  try {
    if (opts.imageUrl) {
      K.Share.sendDefault({
        objectType: "feed",
        content: {
          title: opts.title,
          description: opts.description || "",
          imageUrl: opts.imageUrl,
          link,
        },
        buttons: [{ title: "보러가기", link }],
      });
    } else {
      K.Share.sendDefault({
        objectType: "text",
        text: opts.description ? `${opts.title}\n${opts.description}` : opts.title,
        link,
      });
    }
    return true;
  } catch {
    return false;
  }
}
