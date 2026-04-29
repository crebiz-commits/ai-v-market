import { motion } from "motion/react";
import { Sparkles, Play, ShoppingBag, Zap } from "lucide-react";
import { Button } from "./ui/button";
import { CreaiteText } from "./CreaiteText";
import { CreaiteLogo } from "./CreaiteLogo";

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  return (
    <div className="h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#6366f1]/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#8b5cf6]/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 text-center max-w-md">
        {/* Logo */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", duration: 0.8 }}
          className="mb-8"
        >
          <div className="w-32 h-32 mx-auto mb-4 flex items-center justify-center">
            <CreaiteLogo className="w-full h-full" />
          </div>
          <h1 className="mb-2">
            <CreaiteText className="text-4xl font-extrabold" />
          </h1>
          <p className="text-muted-foreground">AI 영상 특화 오픈마켓</p>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4 mb-8"
        >
          <div className="flex items-start gap-4 text-left">
            <div className="w-10 h-10 rounded-full bg-[#6366f1]/20 flex items-center justify-center flex-shrink-0">
              <Play className="w-5 h-5 text-[#6366f1]" />
            </div>
            <div>
              <h3 className="font-medium mb-1">발견형 커머스</h3>
              <p className="text-sm text-muted-foreground">
                틱톡/릴스 스타일로 AI 영상을 탐색하고 구매
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 text-left">
            <div className="w-10 h-10 rounded-full bg-[#8b5cf6]/20 flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="w-5 h-5 text-[#8b5cf6]" />
            </div>
            <div>
              <h3 className="font-medium mb-1">다중 라이선스</h3>
              <p className="text-sm text-muted-foreground">
                용도에 맞는 라이선스를 선택하여 구매
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 text-left">
            <div className="w-10 h-10 rounded-full bg-[#3b82f6]/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-[#3b82f6]" />
            </div>
            <div>
              <h3 className="font-medium mb-1">안전한 거래</h3>
              <p className="text-sm text-muted-foreground">
                저작권 확인 및 에스크로 시스템 지원
              </p>
            </div>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <Button
            onClick={onComplete}
            className="w-full h-12 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e3] hover:to-[#7c4ee5] text-lg"
          >
            시작하기
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            AI 영상 마켓플레이스의 새로운 경험
          </p>
        </motion.div>
      </div>
    </div>
  );
}
