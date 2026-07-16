// ════════════════════════════════════════════════════════════════════════════
// 에디토리얼 HTML 새니타이저 — 관리자 편집 HTML(컬렉션/스포트라이트 intro)을
//   dangerouslySetInnerHTML 로 렌더하기 전 정리. 허용목록(allowlist) 방식:
//   브라우저 DOMParser 로 실제 파싱 후 허용 태그만 남기고, 나머지는 언랩(텍스트 보존).
//   모든 속성 제거(이벤트 핸들러 on*·style 등 차단), <a> 만 안전 href 유지.
//   → <script>/<iframe>/<img onerror>/javascript: 등 저장형 XSS 벡터 차단.
//   (정규식 블록리스트는 우회가 쉬워, 실제 HTML 파서 기반 허용목록을 사용)
// ════════════════════════════════════════════════════════════════════════════

const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A", "SPAN"]);

export function sanitizeEditorialHtml(html: string | null | undefined): string {
  if (!html) return "";
  // SSR/비브라우저 환경 방어 — DOMParser 없으면 태그를 모두 제거(텍스트만).
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    return html.replace(/<[^>]*>/g, "");
  }
  const doc = new DOMParser().parseFromString(html, "text/html");

  const walk = (node: Element) => {
    // 자식 스냅샷(순회 중 DOM 변경 대비)
    Array.from(node.children).forEach((el) => {
      if (!ALLOWED_TAGS.has(el.tagName)) {
        // 비허용 태그: 자식(텍스트)만 남기고 태그 제거(언랩). script/style 는 내용까지 제거.
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE") {
          el.remove();
        } else {
          walk(el);                 // 먼저 내부 정리
          el.replaceWith(...Array.from(el.childNodes));
        }
        return;
      }
      // 허용 태그: 모든 속성 제거(이벤트 핸들러·style·srcset 등). <a> 만 안전 href 유지.
      Array.from(el.attributes).forEach((attr) => {
        const safeHref =
          el.tagName === "A" &&
          attr.name.toLowerCase() === "href" &&
          /^(https?:\/\/|\/|#|mailto:)/i.test(attr.value.trim());
        if (!safeHref) el.removeAttribute(attr.name);
      });
      if (el.tagName === "A") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer nofollow");
      }
      walk(el);
    });
  };

  walk(doc.body);
  return doc.body.innerHTML;
}
