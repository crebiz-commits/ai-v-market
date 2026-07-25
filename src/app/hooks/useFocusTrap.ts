// ════════════════════════════════════════════════════════════════════════════
// 모달 포커스트랩 훅 (A7, 2026-07-25)
//
//   손수만든(비-Radix) role="dialog" 모달용 키보드 접근성. 열려 있는 동안:
//     · 최초 포커스를 모달 내부 첫 포커서블로 이동
//     · Tab / Shift+Tab 순환을 모달 내부로 가둠(뒤 페이지로 새지 않음)
//     · Esc → onEscape (보통 onClose)
//     · 닫힐 때 직전 포커스를 복원(트리거 버튼으로 복귀)
//
//   Radix Dialog 기반 모달(ui/dialog 등)은 자체 트랩이 있으므로 대상 아님.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onEscape?: () => void,
) {
  const ref = useRef<T>(null);
  // onEscape 를 ref 로 잡아 매 렌더 새 콜백이 effect 재구독을 유발하지 않게 함
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const prevFocused = document.activeElement as HTMLElement | null;

    // 렌더돼 보이는 포커서블만(getClientRects — display:none/detached 제외)
    const getFocusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
      );

    // 최초 포커스 — 첫 포커서블, 없으면 컨테이너 자체(tabindex 부여)
    const focusables = getFocusable();
    if (focusables[0]) {
      focusables[0].focus();
    } else {
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !container.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    // capture 단계 — 내부 다른 keydown 핸들러보다 먼저 Tab 을 가로챔
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // 닫힐 때 직전 포커스 복원 (여전히 문서에 있을 때만)
      if (prevFocused && document.contains(prevFocused)) prevFocused.focus?.();
    };
  }, [active]);

  return ref;
}
