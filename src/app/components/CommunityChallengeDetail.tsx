import { motion } from "motion/react";
import { ArrowLeft, Trophy, Users, Calendar, Share2, Sparkles, Award, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const daysLeft = getDaysLeft(challenge.deadline);

  const handleShare = async () => {
    const url = `${window.location.origin}?challenge=${challenge.id}`;
    const shareData = { title: challenge.title, text: `CREAITE 챌린지: ${challenge.title} - 상금 ${challenge.prize}`, url };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(t("shareModal.linkCopied"));
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        try { await navigator.clipboard.writeText(url); toast.success("링크가 클립보드에 복사됐습니다!"); } catch {}
      }
    }
  };

  const handleParticipate = () => {
    toast.info(t("communityChallengeDetail.comingSoon"), { duration: 3000 });
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-0 bg-background z-[60] overflow-y-auto"
    >
      {/* 헤더 */}
      <header className="sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-white/10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors text-foreground"
            aria-label={t("creatorChannel.back")}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold">{t("community.tabChallenges")}</span>
          <div className="flex-1" />
          <button
            onClick={handleShare}
            className="p-2 -mr-2 rounded-full hover:bg-white/10 transition-colors text-foreground"
            aria-label={t("common.share")}
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
            🏆 Active
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
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("communityChallengeDetail.prizeLabel")}</p>
            <p className="font-extrabold text-foreground">{challenge.prize}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <Users className="w-5 h-5 text-[#6366f1] mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("communityChallengeDetail.participantsLabel")}</p>
            <p className="font-extrabold text-foreground">{challenge.participants.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <Clock className={`w-5 h-5 mx-auto mb-1 ${daysLeft <= 3 ? "text-red-400" : "text-[#10b981]"}`} />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("communityChallengeDetail.deadlineLabel")}</p>
            <p className={`font-extrabold ${daysLeft <= 3 ? "text-red-400" : "text-foreground"}`}>
              {daysLeft > 0 ? `D-${daysLeft}` : "Ended"}
            </p>
          </div>
        </div>

        {/* 마감일 */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Calendar className="w-4 h-4" />
          <span>{t("community.deadlineLabel", { date: challenge.deadline })}</span>
        </div>

        {/* 설명 */}
        <section className="mb-6">
          <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#a78bfa]" />
            {t("communityChallengeDetail.details")}
          </h2>
          <div className="text-base leading-relaxed text-foreground/90 whitespace-pre-line bg-card rounded-xl border border-border p-4">
            {challenge.description ||
              `Join ${challenge.title}!\n\nShow off your AI video skills for a chance to win ${challenge.prize}. Compete with other creators with your unique creations.\n\nTop entries get featured on the home feed; the 1st place gets a free week-long promo on the market.`}
          </div>
        </section>

        {/* 참여 규칙 */}
        <section className="mb-6">
          <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            Rules
          </h2>
          <ul className="space-y-2 bg-card rounded-xl border border-border p-4">
            {[
              "Submit AI-generated video within 15 seconds",
              "Creative concept matching the theme",
              "9:16 or 16:9 resolution, at least 1080p quality",
              "Submit original prompts (optional)",
              "Up to 3 entries per person",
              "Plagiarism / copyright infringement = auto disqualified",
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
            Prizes
          </h2>
          <div className="space-y-2">
            {[
              { rank: "1st", emoji: "🥇", prize: challenge.prize, perk: "1-week home feed featuring" },
              { rank: "2nd", emoji: "🥈", prize: "₩1,000,000", perk: "Premium creator verification" },
              { rank: "3rd", emoji: "🥉", prize: "₩500,000", perk: "Priority review for next challenge" },
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
            {daysLeft === 0 ? "Closed" : `🚀 ${t("communityChallengeDetail.joinChallenge")} (D-${daysLeft})`}
          </Button>
        </div>
      </footer>
    </motion.div>
  );
}
