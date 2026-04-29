import { useEffect, useRef } from "react";

/**
 * 모바일 뒤로가기 / 브라우저 뒤로가기 버튼으로 모달/패널을 닫기.
 *
 * 내부 동작:
 * - 모달이 열릴 때 history.pushState() → 가상의 history 항목 하나 추가
 * - 사용자가 뒤로가기 → popstate → 이 모달의 onBack 호출
 * - X 버튼 등으로 모달이 코드로 닫히면 history.back()으로 추가했던 항목 제거
 *
 * 여러 모달이 중첩되어 열려도 LIFO로 가장 최근 것부터 닫힘.
 */

const handlers: Array<() => void> = [];
let internalBack = false;
let listenerAttached = false;

function attachGlobalListener() {
  if (listenerAttached) return;
  listenerAttached = true;
  window.addEventListener("popstate", () => {
    // 우리가 history.back()을 직접 호출한 경우 무시
    if (internalBack) {
      internalBack = false;
      return;
    }
    const top = handlers[handlers.length - 1];
    if (top) top();
  });
}

export function useBackButton(isActive: boolean, onBack: () => void) {
  // 최신 onBack 콜백 참조 유지 (effect 재실행 없이)
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!isActive) return;

    attachGlobalListener();

    let popped = false;
    window.history.pushState(null, "");

    const wrappedHandler = () => {
      popped = true;
      onBackRef.current();
    };

    handlers.push(wrappedHandler);

    return () => {
      // handler 스택에서 제거
      const idx = handlers.indexOf(wrappedHandler);
      if (idx >= 0) handlers.splice(idx, 1);

      // 코드로 닫힌 경우 (popstate가 아닌 X 버튼 등) — push했던 history 항목 제거
      if (!popped) {
        internalBack = true;
        window.history.back();
      }
    };
  }, [isActive]);
}
