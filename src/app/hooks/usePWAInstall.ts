import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA 설치 가능 여부·설치 트리거를 제공하는 훅.
 *
 * - Android Chrome / Desktop Chrome·Edge: beforeinstallprompt 이벤트로 자동 트리거 가능
 * - iOS Safari: 자동 트리거 미지원 → 수동 안내 (공유 → 홈 화면에 추가)
 * - 이미 standalone 모드로 실행 중이면 설치된 것으로 간주
 */
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 이미 설치된 PWA로 실행 중인지 감지
    const checkInstalled = () => {
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
      const iosStandalone = (window.navigator as any).standalone === true;
      setIsInstalled(!!standalone || !!iosStandalone);
    };
    checkInstalled();

    // Android·Desktop Chrome/Edge — beforeinstallprompt 이벤트 캐치
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // 설치 완료 이벤트
    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", installedHandler);

    // standalone 모드 변경 감지 (설치 직후 즉시 반영)
    const mq = window.matchMedia?.("(display-mode: standalone)");
    const mqHandler = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
    mq?.addEventListener?.("change", mqHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
      mq?.removeEventListener?.("change", mqHandler);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return choice.outcome === "accepted";
    } catch {
      return false;
    }
  };

  // 플랫폼 감지
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream;
  const isIOSSafari =
    isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  const isAndroid = /Android/.test(ua);

  // 자동 설치 가능 (Android·Desktop)
  const canInstallProgrammatic = !!deferredPrompt && !isInstalled;
  // 설치 안내 가능 (자동 + iOS Safari 수동)
  const canShowInstall = !isInstalled && (canInstallProgrammatic || isIOSSafari);

  return {
    canShowInstall,
    canInstallProgrammatic,
    isInstalled,
    isIOS,
    isIOSSafari,
    isAndroid,
    install,
  };
}
