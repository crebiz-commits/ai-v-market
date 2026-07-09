import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Trophy, Users, Calendar, Share2, Sparkles, Award, Clock, Film, Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { useTranslation } from "react-i18next";
import { supabase } from "../utils/supabaseClient";

export interface Challenge {
  id: string;
  title: string;
  prize: string;
  participants: number;
  deadline: string;
  image: string;
  description?: string;
  tag?: string;       // 출품작 식별 슬러그 (영상 태그 'challenge:<tag>' 로 연결)
  startsAt?: string;  // 시작일 "YYYY.MM.DD" — 미래면 '오픈 예정' (DB challenges.starts_at)
}

interface ChallengeEntry {
  id: string;
  title: string;
  thumbnail: string;
  creator: string;
  likes: number;
}

interface CommunityChallengeDetailProps {
  challenge: Challenge;
  onClose: () => void;
  onParticipate?: (challenge: Challenge) => void;   // 참가하기 → 업로드 진입 (미지정 시 준비중 토스트)
  onEntryClick?: (videoId: string) => void;          // 참여작 클릭 → 영상 재생
}

// 마감일까지 남은 일수 계산 (지난 경우 음수 → 마감 판정에 사용)
function getDaysLeft(deadline: string): number {
  const [y, m, d] = deadline.split(".").map(Number);
  if (!y || !m || !d) return 0;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function CommunityChallengeDetail({ challenge, onClose, onParticipate, onEntryClick }: CommunityChallengeDetailProps) {
  const { t } = useTranslation();
  const daysLeft = getDaysLeft(challenge.deadline);

  // 참여작 — 영상 태그 'challenge:<tag>' 로 연결된 영상 조회 (좋아요순)
  const [entries, setEntries] = useState<ChallengeEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  useEffect(() => {
    if (!challenge.tag) { setEntriesLoading(false); return; }
    let cancelled = false;
    (async () => {
      setEntriesLoading(true);
      const { data, error } = await supabase
        .from("videos")
        .select("id,title,thumbnail,creator,likes,tags")
        .contains("tags", [`challenge:${challenge.tag}`])
        .eq("is_hidden", false)   // 검수 미통과/관리자 숨김 영상 제외 (videos.is_hidden 은 RLS 미강제 → 명시 필터 필수)
        .or("visibility.eq.public,visibility.is.null")
        .order("likes", { ascending: false })
        .limit(12);
      if (cancelled) return;
      if (error) console.warn("[Challenge] 참여작 조회 실패:", error.message);
      setEntries(
        (data || []).map((v: any) => ({
          id: v.id,
          title: v.title || "Untitled",
          thumbnail: v.thumbnail || "",
          creator: v.creator || "AI Creator",
          likes: v.likes || 0,
        }))
      );
      setEntriesLoading(false);
    })();
    return () => { cancelled = true; };
  }, [challenge.tag]);

  // 매월 정기 콘테스트 — 고정 시상 구조 (1등 프리미엄6개월+홈히어로+뱃지 / 2등 프리미엄3개월 / 3등 프리미엄1개월)
  const PRIZE_TIERS = [
    { rank: t("communityChallengeDetail.tier1Rank"), emoji: "🥇", prize: t("communityChallengeDetail.tier1Prize"), perk: t("communityChallengeDetail.tier1Perk") },
    { rank: t("communityChallengeDetail.tier2Rank"), emoji: "🥈", prize: t("communityChallengeDetail.tier2Prize"), perk: t("communityChallengeDetail.tier2Perk") },
    { rank: t("communityChallengeDetail.tier3Rank"), emoji: "🥉", prize: t("communityChallengeDetail.tier3Prize"), perk: t("communityChallengeDetail.tier3Perk") },
  ];

  const RULES = [
    t("communityChallengeDetail.rule1"),
    t("communityChallengeDetail.rule2"),
    t("communityChallengeDetail.rule3"),
    t("communityChallengeDetail.rule4"),
    t("communityChallengeDetail.rule5"),
    t("communityChallengeDetail.rule6"),
  ];

  const handleShare = async () => {
    // R3(2026-06-11): App.tsx 딥링크 핸들러와 일치하는 표준 형식 (단축형 ?challenge= 도 지원됨)
    const url = `${window.location.origin}/?tab=community&sub=challenges&challenge=${challenge.id}`;
    const shareData = { title: challenge.title, text: t("communityChallengeDetail.shareText", { title: challenge.title, prize: challenge.prize }), url };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(t("shareModal.linkCopied"));
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        try { await navigator.clipboard.writeText(url); toast.success(t("shareModal.linkCopied")); } catch {}
      }
    }
  };

  // 시작일이 있으면 날짜 기준, 없으면(레거시) 참가자 0 = 오픈 예정
  const notStarted = challenge.startsAt ? getDaysLeft(challenge.startsAt) > 0 : challenge.participants === 0;
  const status = daysLeft < 0 ? "ended" : notStarted ? "upcoming" : "ongoing";

  const handleParticipate = () => {
    if (status === "upcoming") {
      toast.info(t("communityChallengeDetail.opensSoonToast"), { duration: 3000 });
      return;
    }
    if (onParticipate) { onParticipate(challenge); return; }
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
            className="p-2 -ml-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 transition-colors text-white"
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
          <span className="inline-block px-3 py-1 bg-[#8b5cf6]/30 backdrop-blur-md border border-[#8b5cf6]/50 rounded-full text-xs font-bold text-white mb-2 tracking-wider">
            🏆 {t("communityChallengeDetail.monthlyContest")}
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
              {daysLeft > 0 ? `D-${daysLeft}` : daysLeft === 0 ? "D-Day" : t("communityChallengeDetail.ended")}
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
              t("communityChallengeDetail.defaultDescription", { title: challenge.title, prize: challenge.prize })}
          </div>
        </section>

        {/* 참여 규칙 */}
        <section className="mb-6">
          <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            {t("communityChallengeDetail.rulesTitle")}
          </h2>
          <ul className="space-y-2 bg-card rounded-xl border border-border p-4">
            {RULES.map((rule, i) => (
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
            {t("communityChallengeDetail.prizesTitle")}
          </h2>
          <div className="space-y-2">
            {PRIZE_TIERS.map((item) => (
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

        {/* 참여작 갤러리 */}
        <section className="mt-6">
          <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <Film className="w-5 h-5 text-[#6366f1]" />
            {t("communityChallengeDetail.entriesTitle")}
            {entries.length > 0 && (
              <span className="text-sm font-medium text-muted-foreground">({entries.length})</span>
            )}
          </h2>

          {entriesLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="aspect-video rounded-xl bg-card border border-border animate-pulse" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
              <Film className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-foreground/80 font-medium">
                {t("communityChallengeDetail.noEntries")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {status === "ended"
                  ? t("communityChallengeDetail.endedNotice")
                  : t("communityChallengeDetail.beFirstEntry")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onEntryClick?.(entry.id)}
                  className="group text-left rounded-xl overflow-hidden bg-card border border-border hover:border-[#6366f1]/50 transition-colors"
                >
                  <div className="relative aspect-video overflow-hidden bg-black/40">
                    {entry.thumbnail ? (
                      <img src={entry.thumbnail} alt={entry.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6 text-muted-foreground/40" /></div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-sm font-medium text-foreground truncate">{entry.title}</p>
                    <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                      <span className="truncate">{entry.creator}</span>
                      <span className="flex items-center gap-1 flex-shrink-0"><Heart className="w-3 h-3" />{entry.likes.toLocaleString()}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 참여하기 버튼 (sticky) */}
      <footer className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur-xl border-t border-white/10 z-30 p-3">
        <div className="max-w-3xl mx-auto">
          <Button
            onClick={handleParticipate}
            disabled={status === "ended"}
            className="w-full py-6 text-base font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 disabled:opacity-50 shadow-lg"
          >
            {status === "ended"
              ? t("communityChallengeDetail.closedButton")
              : status === "upcoming"
              ? t("communityChallengeDetail.upcomingButton")
              : `🚀 ${t("communityChallengeDetail.joinChallenge")} (D-${daysLeft})`}
          </Button>
        </div>
      </footer>
    </motion.div>
  );
}
