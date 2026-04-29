import { motion } from "motion/react";
import { ArrowLeft, Trophy, Users, Calendar, Share2, Sparkles, Award, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";

export interface Challenge {
  id: string;
  title: string;
  prize: string;
  participants: number;
  deadline: string;
  image: string;
  description?: string;
}

interface CommunityChallengeDetailProps {
  challenge: Challenge;
  onClose: () => void;
}

// 마감일까지 남은 일수 계산
function getDaysLeft(deadline: string): number {
  const [y, m, d] = deadline.split(".").map(Number);
  if (!y || !m || !d) return 0;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export function CommunityChallengeDetail({ challenge, onClose }: CommunityChallengeDetailProps) {
  const daysLeft = getDaysLeft(challenge.deadline);

  const handleShare = async () => {
    const url = `${window.location.origin}?challenge=${challenge.id}`;
    const shareData = { title: challenge.title, text: `CREAITE 챌린지: ${challenge.title} - 상금 ${challenge.prize}`, url };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("링크가 클립보드에 복사됐습니다!");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        try { await navigator.clipboard.writeText(url); toast.success("링크가 클립보드에 복사됐습니다!"); } catch {}
      }
    }
  };

  const handleParticipate = () => {
    toast.info("챌린지 참여 기능은 곧 오픈됩니다!", { duration: 3000 });
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-0 bg-background z-40 overflow-y-auto"
    >
      {/* 헤더 */}
      <header className="sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-white/10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors text-foreground"
            aria-label="뒤로가기"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold">챌린지</span>
          <div className="flex-1" />
          <button
            onClick={handleShare}
            className="p-2 -mr-2 rounded-full hover:bg-white/10 transition-colors text-foreground"
            aria-label="공유"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 히어로 이미지 */}
      <div className="relative h-64 md:h-80 overflow-hidden">
        <img src={challenge.image} alt={challenge.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute bottom-4 left-0 right-0 px-4 md:px-6 max-w-3xl mx-auto">
          <span className="inline-block px-3 py-1 bg-[#8b5cf6]/30 backdrop-blur-md border border-[#8b5cf6]/50 rounded-full text-xs font-bold text-white mb-2 uppercase tracking-wider">
            🏆 진행 중
          </span>
          <h1 className="text-2xl md:text-4xl font-extrabold text-white leading-tight drop-shadow-lg">
            {challenge.title}
          </h1>
        </div>
      </div>

      {/* 본문 */}
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 pb-32">
        {/* 핵심 정보 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <Trophy className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">상금</p>
            <p className="font-extrabold text-foreground">{challenge.prize}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <Users className="w-5 h-5 text-[#6366f1] mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">참여자</p>
            <p className="font-extrabold text-foreground">{challenge.participants.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <Clock className={`w-5 h-5 mx-auto mb-1 ${daysLeft <= 3 ? "text-red-400" : "text-[#10b981]"}`} />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">남은 기간</p>
            <p className={`font-extrabold ${daysLeft <= 3 ? "text-red-400" : "text-foreground"}`}>
              {daysLeft > 0 ? `D-${daysLeft}` : "종료"}
            </p>
          </div>
        </div>

        {/* 마감일 */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Calendar className="w-4 h-4" />
          <span>마감일: {challenge.deadline}</span>
        </div>

        {/* 설명 */}
        <section className="mb-6">
          <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#a78bfa]" />
            챌린지 소개
          </h2>
          <div className="text-base leading-relaxed text-foreground/90 whitespace-pre-line bg-card rounded-xl border border-border p-4">
            {challenge.description ||
              `${challenge.title}에 참여하세요!\n\nAI 영상 제작 실력을 뽐내고 ${challenge.prize}의 상금을 획득할 기회입니다. 창의적이고 독특한 영상을 만들어 다른 크리에이터들과 경쟁해 보세요.\n\n우수작은 메인 피드에 노출되며, 1위 작품은 마켓 전면에 일주일 동안 무료 프로모션으로 게재됩니다.`}
          </div>
        </section>

        {/* 참여 규칙 */}
        <section className="mb-6">
          <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            참여 규칙
          </h2>
          <ul className="space-y-2 bg-card rounded-xl border border-border p-4">
            {[
              "15초 이내의 AI 생성 영상 제출",
              "주제에 맞는 창의적인 컨셉",
              "9:16 또는 16:9 해상도, 최소 1080p 화질",
              "원본 프롬프트 함께 제출 (선택)",
              "한 사람당 최대 3개 작품 제출 가능",
              "표절·저작권 침해 콘텐츠 자동 실격",
            ].map((rule, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/90">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-[10px] font-bold text-white mt-0.5">
                  {i + 1}
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 시상 내역 */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            시상 내역
          </h2>
          <div className="space-y-2">
            {[
              { rank: "1위", emoji: "🥇", prize: challenge.prize, perk: "메인 피드 1주 노출" },
              { rank: "2위", emoji: "🥈", prize: "100만원", perk: "프리미엄 크리에이터 인증" },
              { rank: "3위", emoji: "🥉", prize: "50만원", perk: "다음 챌린지 우선 심사" },
            ].map((item) => (
              <div key={item.rank} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                <span className="text-2xl">{item.emoji}</span>
                <div className="flex-1">
                  <p className="font-bold text-foreground">{item.rank} — {item.prize}</p>
                  <p className="text-xs text-muted-foreground">{item.perk}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 참여하기 버튼 (sticky) */}
      <footer className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur-xl border-t border-white/10 z-30 p-3">
        <div className="max-w-3xl mx-auto">
          <Button
            onClick={handleParticipate}
            disabled={daysLeft === 0}
            className="w-full py-6 text-base font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 disabled:opacity-50 shadow-lg"
          >
            {daysLeft === 0 ? "마감된 챌린지" : `🚀 참여하기 (D-${daysLeft})`}
          </Button>
        </div>
      </footer>
    </motion.div>
  );
}
