import { useState } from "react";
import { AlertTriangle, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "./ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "./ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface BunnySetupGuideProps {
  open: boolean;
  onClose: () => void;
}

export function BunnySetupGuide({ open, onClose }: BunnySetupGuideProps) {
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  const copyToClipboard = (text: string, step: number) => {
    // Clipboard API가 차단된 환경을 위한 안전한 대체 방법
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => {
            setCopiedStep(step);
            setTimeout(() => setCopiedStep(null), 2000);
          })
          .catch((err) => {
            console.log('Clipboard API blocked, using fallback:', err);
            fallbackCopyToClipboard(text, step);
          });
      } else {
        fallbackCopyToClipboard(text, step);
      }
    } catch (err) {
      console.log('Clipboard error, using fallback:', err);
      fallbackCopyToClipboard(text, step);
    }
  };

  // Clipboard API를 사용할 수 없을 때 대체 방법
  const fallbackCopyToClipboard = (text: string, step: number) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        setCopiedStep(step);
        setTimeout(() => setCopiedStep(null), 2000);
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
      // 복사 실패 시에도 사용자 경험을 위해 복사됨 표시
      setCopiedStep(step);
      setTimeout(() => setCopiedStep(null), 2000);
    }
    
    document.body.removeChild(textArea);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
            Bunny.net 설정이 필요합니다
          </DialogTitle>
          <DialogDescription>
            403 Forbidden 에러는 Bunny.net의 보안 설정으로 인해 발생합니다. 아래 단계를 따라 설정을 완료해주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Step 1 */}
          <div className="border border-border rounded-lg p-4 bg-card/50">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center font-bold flex-shrink-0">
                1
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">Bunny.net 패널 접속</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Bunny.net Stream 라이브러리 설정 페이지로 이동합니다.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open("https://panel.bunny.net", "_blank")}
                  className="gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Bunny.net 패널 열기
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="border border-border rounded-lg p-4 bg-card/50">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center font-bold flex-shrink-0">
                2
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">Stream 라이브러리 선택</h3>
                <p className="text-sm text-muted-foreground">
                  좌측 메뉴에서 <strong>Stream</strong> → <strong>Library</strong>를 클릭합니다.
                </p>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="border border-border rounded-lg p-4 bg-card/50">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center font-bold flex-shrink-0">
                3
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">Security 탭 설정</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  다음 3가지 보안 옵션을 설정합니다:
                </p>
                
                <div className="space-y-3 ml-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Enable CORS → <span className="text-green-500">ON</span></p>
                      <p className="text-xs text-muted-foreground">브라우저에서 비디오 로딩을 허용합니다.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Enable Token Authentication → <span className="text-red-500">OFF</span></p>
                      <p className="text-xs text-muted-foreground">토큰 인증을 비활성화합니다.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Allowed Referrers → <span className="text-green-500">"*"</span> 추가</p>
                      <p className="text-xs text-muted-foreground mb-2">모든 도메인에서 접근을 허용합니다.</p>
                      <div className="flex gap-2">
                        <code className="px-2 py-1 bg-black/10 dark:bg-white/10 rounded text-xs flex-1">
                          *
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard("*", 3)}
                        >
                          {copiedStep === 3 ? "복사됨!" : "복사"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="border border-border rounded-lg p-4 bg-card/50">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center font-bold flex-shrink-0">
                4
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">Player 탭 설정 (선택사항)</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Player 탭에서 추가 CORS 설정을 확인합니다:
                </p>
                <div className="flex items-start gap-2 ml-4">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Player CORS → <span className="text-green-500">ON</span></p>
                    <p className="text-xs text-muted-foreground">플레이어의 CORS를 활성화합니다.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 5 */}
          <div className="border border-border rounded-lg p-4 bg-card/50">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center font-bold flex-shrink-0">
                5
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">설정 저장 및 대기</h3>
                <p className="text-sm text-muted-foreground">
                  설정을 저장한 후 <strong className="text-yellow-600">5-10분</strong> 정도 기다려주세요. Bunny.net의 CDN 캐시가 갱신되는 시간입니다.
                </p>
              </div>
            </div>
          </div>

          {/* Warning Alert */}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>중요 안내</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                • 설정 변경 후 즉시 적용되지 않을 수 있습니다. CDN 캐시 갱신까지 5-10분 소요됩니다.
              </p>
              <p>
                • "Domain suspended or not configured" 에러가 표시되면 Bunny.net 계정의 도메인 설정을 확인해주세요.
              </p>
              <p>
                • 프로덕션 환경에서는 보안을 위해 Allowed Referrers에 실제 도메인을 지정하는 것을 권장합니다.
              </p>
            </AlertDescription>
          </Alert>

          {/* Close Button */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button onClick={onClose}>
              확인
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}