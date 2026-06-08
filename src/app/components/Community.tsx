import { useState, useEffect, useRef } from "react";
import { Trophy, MessageCircle, Heart, Bookmark, Plus, X, Send, Loader2, Handshake, UserPlus, HelpCircle, Briefcase, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Footer } from "./Footer";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "motion/react";
import { CommentPanel } from "./CommentPanel";
import { CommunityPostDetail, Post } from "./CommunityPostDetail";
import { CommunityChallengeDetail, Challenge } from "./CommunityChallengeDetail";
import { useAuth } from "../contexts/AuthContext";
import { useBackButton } from "../hooks/useBackButton";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// community_posts row → Post 매핑. (mock 데모는 CommunityMockShowcase.tsx 에 보존: ?preview=community-mock)
function rowToPost(r: any, localeTag: string): Post {
  return {
    id: r.id,
    author: r.author_name || "AI Creator",
    avatar: r.author_avatar || "",
    title: r.title,
    content: r.content,
    category: r.category || "일반",
    likes: r.likes_count || 0,
    comments: r.comments_count || 0,
    timestamp: r.created_at ? new Date(r.created_at).toLocaleDateString(localeTag) : "",
    image: r.image_url || undefined,
  };
}

// (mock POSTS 보존본은 CommunityMockShowcase.tsx 로 이전됨)
const _UNUSED_POSTS_KO: Post[] = [
  {
    id: "1",
    author: "AI Creator Pro",
    avatar: "https://images.unsplash.com/photo-1595745688820-1a8bca9dd00f?w=100&h=100&fit=crop",
    title: "Sora로 영화 같은 영상 만드는 프롬프트 팁 5가지",
    content: "1. 카메라 무브먼트를 구체적으로 명시하세요 (dolly zoom, crane shot 등)\n2. 조명 스타일 지정 (cinematic lighting, golden hour)\n3. 감정을 표현하는 형용사 사용...",
    category: "팁",
    likes: 342,
    comments: 28,
    timestamp: "2시간 전",
    image: "https://images.unsplash.com/photo-1612000656409-16fcf948b2d9?w=400&h=300&fit=crop"
  },
  {
    id: "2",
    author: "VideoMaster",
    avatar: "https://images.unsplash.com/photo-1633743252577-ccb68cbdb6ed?w=100&h=100&fit=crop",
    title: "이달의 챌린지: '미래 도시' 테마 영상 공모",
    content: "매달 열리는 CREAITE 콘테스트! 이달의 테마는 미래 도시입니다. 5분 이내 AI 영상으로 도전하세요. 1등 30만원·2등 20만원·3등 10만원, 우수작은 메인 피드에 노출됩니다.",
    category: "챌린지",
    likes: 891,
    comments: 156,
    timestamp: "1일 전"
  },
  {
    id: "3",
    author: "NatureLover",
    avatar: "https://images.unsplash.com/photo-1551728715-88730314d185?w=100&h=100&fit=crop",
    title: "Runway Gen-3 vs Pika Labs 실사 비교",
    content: "같은 프롬프트로 두 툴을 사용해봤습니다. 결과가 흥미롭네요. Runway는 디테일이 좋고, Pika는 자연스러운 움직임이 장점입니다.",
    category: "비교",
    likes: 567,
    comments: 89,
    timestamp: "3일 전",
    image: "https://images.unsplash.com/photo-1551728715-88730314d185?w=400&h=300&fit=crop"
  },
  {
    id: "4",
    author: "PromptWizard",
    avatar: "https://images.unsplash.com/photo-1580895456895-cfdf02e4c23f?w=100&h=100&fit=crop",
    title: "프롬프트 공유: 네온 사이버펑크 도시 야경",
    content: '"Neon-lit cyberpunk city at night, flying cars, holographic billboards, rain-soaked streets, cinematic wide shot, blade runner style, 8k ultra detailed" - 이 프롬프트로 대박 영상 나왔어요!',
    category: "프롬프트",
    likes: 1203,
    comments: 234,
    timestamp: "5일 전"
  },
  {
    id: "5",
    author: "AnimationStudio",
    avatar: "https://images.unsplash.com/photo-1772371272174-392cf9cfabae?w=100&h=100&fit=crop",
    title: "AI 애니메이션 제작 워크플로우 공유",
    content: "캐릭터 디자인 → AI 생성 → 편집 → 후보정까지 전 과정을 공유합니다. 질문 환영합니다!",
    category: "튜토리얼",
    likes: 678,
    comments: 92,
    timestamp: "1주일 전",
    image: "https://images.unsplash.com/photo-1772371272174-392cf9cfabae?w=400&h=300&fit=crop"
  }
];

const POSTS_EN: Post[] = [
  {
    id: "1",
    author: "AI Creator Pro",
    avatar: "https://images.unsplash.com/photo-1595745688820-1a8bca9dd00f?w=100&h=100&fit=crop",
    title: "5 prompt tips for cinematic Sora videos",
    content: "1. Specify camera movement (dolly zoom, crane shot, etc.)\n2. Define lighting style (cinematic lighting, golden hour)\n3. Use emotional adjectives...",
    category: "팁",
    likes: 342,
    comments: 28,
    timestamp: "2h ago",
    image: "https://images.unsplash.com/photo-1612000656409-16fcf948b2d9?w=400&h=300&fit=crop"
  },
  {
    id: "2",
    author: "VideoMaster",
    avatar: "https://images.unsplash.com/photo-1633743252577-ccb68cbdb6ed?w=100&h=100&fit=crop",
    title: "Monthly Challenge: 'Future City' theme video contest",
    content: "CREAITE's monthly contest! This month's theme is Future City. Create an AI video up to 5 minutes to enter. 1st ₩300,000 · 2nd ₩200,000 · 3rd ₩100,000, top entries get featured on the home feed.",
    category: "챌린지",
    likes: 891,
    comments: 156,
    timestamp: "1d ago"
  },
  {
    id: "3",
    author: "NatureLover",
    avatar: "https://images.unsplash.com/photo-1551728715-88730314d185?w=100&h=100&fit=crop",
    title: "Runway Gen-3 vs Pika Labs realism comparison",
    content: "I tried the same prompt on both tools. Interesting results — Runway has better detail, while Pika produces more natural motion.",
    category: "비교",
    likes: 567,
    comments: 89,
    timestamp: "3d ago",
    image: "https://images.unsplash.com/photo-1551728715-88730314d185?w=400&h=300&fit=crop"
  },
  {
    id: "4",
    author: "PromptWizard",
    avatar: "https://images.unsplash.com/photo-1580895456895-cfdf02e4c23f?w=100&h=100&fit=crop",
    title: "Prompt: Neon cyberpunk city at night",
    content: '"Neon-lit cyberpunk city at night, flying cars, holographic billboards, rain-soaked streets, cinematic wide shot, blade runner style, 8k ultra detailed" — this prompt produced amazing results!',
    category: "프롬프트",
    likes: 1203,
    comments: 234,
    timestamp: "5d ago"
  },
  {
    id: "5",
    author: "AnimationStudio",
    avatar: "https://images.unsplash.com/photo-1772371272174-392cf9cfabae?w=100&h=100&fit=crop",
    title: "Sharing my AI animation workflow",
    content: "From character design → AI generation → editing → post-production, sharing the full process. Questions welcome!",
    category: "튜토리얼",
    likes: 678,
    comments: 92,
    timestamp: "1w ago",
    image: "https://images.unsplash.com/photo-1772371272174-392cf9cfabae?w=400&h=300&fit=crop"
  }
];

const getNextDeadline = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

// 마감일("YYYY.MM.DD") 기준 남은 일수
const getDaysLeft = (deadline: string): number => {
  const [y, m, d] = deadline.split(".").map(Number);
  if (!y || !m || !d) return 0;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

// 챌린지 진행 상태 — 'ended'(마감) / 'upcoming'(예고, 참가자 0) / 'ongoing'(진행중)
const getChallengeStatus = (c: { deadline: string; participants: number }): "ended" | "upcoming" | "ongoing" => {
  if (getDaysLeft(c.deadline) < 0) return "ended";
  if (c.participants === 0) return "upcoming";
  return "ongoing";
};

const CHALLENGES_KO: Challenge[] = [
  {
    id: "1",
    title: "이달의 챌린지 · 미래 도시",
    tag: "future-city",
    prize: "총 60만원",
    participants: 342,
    deadline: getNextDeadline(15),
    image: "https://images.unsplash.com/photo-1580895456895-cfdf02e4c23f?w=400&h=200&fit=crop",
    description: "매달 열리는 CREAITE 콘테스트, 이달의 테마는 '미래 도시'입니다.\n\nCyberpunk, 네온, 미래 도시를 주제로 한 5분 이내 AI 영상을 제작해주세요. Blade Runner, 사이버펑크 2077, 고스트 인 더 셸 같은 작품들에서 영감을 받아 자신만의 미래 도시 비전을 표현해 보세요. 디스토피아든 유토피아든, 어떤 미래를 그리느냐는 자유입니다.\n\n🏆 1등 30만원 · 2등 20만원 · 3등 10만원\n우수작은 CREAITE 메인 피드에 1주일 동안 무료 노출됩니다.",
  },
  {
    id: "2",
    title: "지난 달 · 자연 다큐멘터리",
    tag: "nature-doc",
    prize: "총 60만원",
    participants: 189,
    deadline: getNextDeadline(-5),
    image: "https://images.unsplash.com/photo-1551728715-88730314d185?w=400&h=200&fit=crop",
    description: "BBC Earth 같은 시네마틱 자연 다큐 스타일 영상을 만드는 챌린지였습니다. (마감된 지난 회차)\n\n광활한 자연의 경이로움, 야생 동물의 생동감 넘치는 순간, 또는 작은 곤충의 미시 세계까지 — 어떤 자연이든 좋습니다. 시네마틱 연출과 감정적 임팩트가 핵심 평가 요소였습니다.\n\n🏆 1등 30만원 · 2등 20만원 · 3등 10만원",
  },
  {
    id: "3",
    title: "다음 달 예고 · 추상 아트 비주얼",
    tag: "abstract-art",
    prize: "총 60만원",
    participants: 0,
    deadline: getNextDeadline(40),
    image: "https://images.unsplash.com/photo-1633743252577-ccb68cbdb6ed?w=400&h=200&fit=crop",
    description: "다음 달 콘테스트 테마는 '추상 아트 비주얼'입니다. (오픈 예정)\n\n추상적 비주얼, 컬러, 모션, 패턴을 활용한 실험적인 영상을 제작하세요. 구체적인 주제 없이도 OK. 음악 시각화, 추상 표현주의, 사이키델릭 아트 등 자유롭게 표현해 주세요. 영상미와 독창성이 평가 기준입니다.\n\n🏆 1등 30만원 · 2등 20만원 · 3등 10만원",
  },
];

const CHALLENGES_EN: Challenge[] = [
  {
    id: "1",
    title: "This Month · Future City",
    tag: "future-city",
    prize: "₩600,000 total",
    participants: 342,
    deadline: getNextDeadline(15),
    image: "https://images.unsplash.com/photo-1580895456895-cfdf02e4c23f?w=400&h=200&fit=crop",
    description: "CREAITE's monthly contest — this month's theme is 'Future City'.\n\nCreate an AI video (up to 5 minutes) on Cyberpunk, neon, or future city themes. Draw inspiration from Blade Runner, Cyberpunk 2077, or Ghost in the Shell, and express your own vision of the future city. Whether dystopia or utopia, the vision is yours.\n\n🏆 1st ₩300,000 · 2nd ₩200,000 · 3rd ₩100,000\nTop entries will be featured on CREAITE's home feed for one week, free of charge.",
  },
  {
    id: "2",
    title: "Last Month · Nature Documentary",
    tag: "nature-doc",
    prize: "₩600,000 total",
    participants: 189,
    deadline: getNextDeadline(-5),
    image: "https://images.unsplash.com/photo-1551728715-88730314d185?w=400&h=200&fit=crop",
    description: "A challenge to make a cinematic nature documentary in the style of BBC Earth. (Closed — past round)\n\nFrom the wonders of vast landscapes, to the lively moments of wildlife, to the microcosm of tiny insects — any subject works. Cinematic direction and emotional impact were the key criteria.\n\n🏆 1st ₩300,000 · 2nd ₩200,000 · 3rd ₩100,000",
  },
  {
    id: "3",
    title: "Next Month · Abstract Art Visuals",
    tag: "abstract-art",
    prize: "₩600,000 total",
    participants: 0,
    deadline: getNextDeadline(40),
    image: "https://images.unsplash.com/photo-1633743252577-ccb68cbdb6ed?w=400&h=200&fit=crop",
    description: "Next month's contest theme is 'Abstract Art Visuals'. (Coming soon)\n\nCreate an experimental video using abstract visuals, color, motion, and pattern. No specific subject required. Feel free to express yourself with music visualization, abstract expressionism, psychedelic art, and more. Visual quality and originality are the evaluation criteria.\n\n🏆 1st ₩300,000 · 2nd ₩200,000 · 3rd ₩100,000",
  },
];

// ─── 크리에이터 협업 공간 ────────────────────────────────────────────────
type CollabType = "recruit" | "join" | "help" | "outsource";

interface CollabPost {
  id: string;
  ownerId?: string;       // 작성자 user_id (본인 글 판별)
  type: CollabType;
  title: string;
  author: string;
  avatar: string;
  description: string;
  roles: string[];        // 필요 역할/스킬
  reward: string;         // 보상 형태
  status: "open" | "closed";
  applicants: number;
  timestamp: string;
}

// 상대 시간 ("3시간 전" / "3h ago")
function timeAgo(iso: string | null | undefined, isKo: boolean): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return isKo ? "방금" : "just now";
  if (min < 60) return isKo ? `${min}분 전` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return isKo ? `${hr}시간 전` : `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return isKo ? `${day}일 전` : `${day}d ago`;
  const wk = Math.floor(day / 7);
  return isKo ? `${wk}주 전` : `${wk}w ago`;
}

// collab_posts row → CollabPost
function collabRowToPost(r: any, isKo: boolean): CollabPost {
  return {
    id: r.id,
    ownerId: r.user_id,
    type: r.type,
    title: r.title,
    author: r.author_name || (isKo ? "크리에이터" : "Creator"),
    avatar: r.author_avatar || "",
    description: r.description || "",
    roles: Array.isArray(r.roles) ? r.roles : [],
    reward: r.reward || "",
    status: r.status === "closed" ? "closed" : "open",
    applicants: r.applicants_count || 0,
    timestamp: timeAgo(r.created_at, isKo),
  };
}

const COLLAB_TYPE_META: Record<CollabType, { ko: string; en: string; cls: string; Icon: any }> = {
  recruit:   { ko: "팀원 모집", en: "Recruiting",   cls: "bg-[#8b5cf6]/20 text-[#a78bfa] border-[#8b5cf6]/40", Icon: UserPlus },
  join:      { ko: "참여 희망", en: "Available",    cls: "bg-[#10b981]/20 text-[#34d399] border-[#10b981]/40", Icon: Handshake },
  help:      { ko: "도움 요청", en: "Need help",    cls: "bg-[#f59e0b]/20 text-[#fbbf24] border-[#f59e0b]/40", Icon: HelpCircle },
  outsource: { ko: "외주 · 유료", en: "Hiring · paid", cls: "bg-[#3b82f6]/20 text-[#60a5fa] border-[#3b82f6]/40", Icon: Briefcase },
};

const CATEGORIES = ["팁", "챌린지", "비교", "프롬프트", "튜토리얼", "일반", "질문"];

const COMMUNITY_CATEGORY_KEY: Record<string, string> = {
  "팁": "communityCategory.tip",
  "챌린지": "communityCategory.challenge",
  "비교": "communityCategory.compare",
  "프롬프트": "communityCategory.prompt",
  "튜토리얼": "communityCategory.tutorial",
  "일반": "communityCategory.general",
  "질문": "communityCategory.question",
};

const CATEGORY_COLOR: Record<string, string> = {
  "챌린지": "bg-[#8b5cf6]/20 text-[#8b5cf6]",
  "팁": "bg-[#3b82f6]/20 text-[#3b82f6]",
  "프롬프트": "bg-[#10b981]/20 text-[#10b981]",
  "튜토리얼": "bg-[#f59e0b]/20 text-[#f59e0b]",
  "비교": "bg-[#ef4444]/20 text-[#ef4444]",
  "일반": "bg-[#6366f1]/20 text-[#6366f1]",
  "질문": "bg-[#06b6d4]/20 text-[#06b6d4]",
};

interface CommunityProps {
  onNavigate?: (tab: string) => void;
  initialTab?: string | null;               // 외부에서 특정 탭으로 진입 (예: 시네마 콘테스트 배너 → challenges)
  onInitialTabConsumed?: () => void;         // 초기 탭 적용 후 신호 소거
  onChallengeParticipate?: (challenge: Challenge) => void;  // 챌린지 참가 → 업로드 진입
  onPlayVideo?: (videoId: string) => void;   // 참여작 클릭 → 영상 재생
}

export function Community({ onNavigate, initialTab, onInitialTabConsumed, onChallengeParticipate, onPlayVideo }: CommunityProps = {}) {
  const { t, i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  const { user, isAuthenticated, profile } = useAuth();
  const localeTag = isKo ? "ko-KR" : "en-US";
  const [activeTab, setActiveTab] = useState("posts");
  // 외부에서 특정 탭으로 진입 (예: 시네마 콘테스트 공모전 배너 → 챌린지 탭)
  useEffect(() => {
    const VALID = ['posts', 'challenges', 'collab'];
    if (initialTab && VALID.includes(initialTab)) {
      setActiveTab(initialTab);
      onInitialTabConsumed?.();
    }
  }, [initialTab, onInitialTabConsumed]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const challenges = isKo ? CHALLENGES_KO : CHALLENGES_EN;
  const [collabs, setCollabs] = useState<CollabPost[]>([]);
  const [loadingCollab, setLoadingCollab] = useState(true);
  const [appliedCollabIds, setAppliedCollabIds] = useState<Set<string>>(new Set());
  const [collabFilter, setCollabFilter] = useState<"all" | CollabType>("all");
  // 협업 글 작성 모달
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [submittingCollab, setSubmittingCollab] = useState(false);
  const [collabForm, setCollabForm] = useState<{ type: CollabType; title: string; description: string; roles: string; reward: string }>({
    type: "recruit", title: "", description: "", roles: "", reward: "",
  });
  // 지원자 목록 보기 (작성자 전용)
  const [viewApplicantsOf, setViewApplicantsOf] = useState<CollabPost | null>(null);
  const [applicants, setApplicants] = useState<{ name: string; message: string | null; date: string }[]>([]);
  const [loadingApplicants, setLoadingApplicants] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [showWriteModal, setShowWriteModal] = useState(false);

  // 상세 페이지 state
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  // 챌린지 참가 → 오버레이를 먼저 닫고(useBackButton history 정리), 닫힘 애니메이션 완료 후 업로드로 이동.
  // (오버레이 언마운트의 history.back() 과 탭 이동 pushState 가 충돌해 게시글 탭으로 튕기는 문제 방지)
  const pendingParticipateRef = useRef<Challenge | null>(null);
  const handleChallengeParticipate = (challenge: Challenge) => {
    pendingParticipateRef.current = challenge;
    setSelectedChallenge(null);
  };

  // Write modal state
  const [writeTitle, setWriteTitle] = useState("");
  const [writeContent, setWriteContent] = useState("");
  const [writeCategory, setWriteCategory] = useState("일반");
  const [submitting, setSubmitting] = useState(false);

  // 뒤로가기로 모든 모달/패널 닫기 (LIFO)
  useBackButton(showWriteModal, () => setShowWriteModal(false));
  useBackButton(!!commentPostId, () => setCommentPostId(null));
  useBackButton(!!selectedPost, () => setSelectedPost(null));
  useBackButton(!!selectedChallenge, () => setSelectedChallenge(null));
  useBackButton(showCollabModal, () => setShowCollabModal(false));
  useBackButton(!!viewApplicantsOf, () => setViewApplicantsOf(null));

  // H10(2026-05-31): 커뮤니티 글 실제 DB 로드 (기존 mock 은 ?preview=community-mock 에 보존)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPosts(true);
      const { data, error } = await supabase
        .from("community_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) console.warn("[Community] 게시글 조회 실패:", error.message);
      else setPosts((data || []).map((r) => rowToPost(r, localeTag)));
      setLoadingPosts(false);
    })();
    return () => { cancelled = true; };
  }, [localeTag]);

  // 협업 글 + 내가 지원한 글 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCollab(true);
      const { data, error } = await supabase
        .from("collab_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) console.warn("[Collab] 협업 글 조회 실패:", error.message);
      else setCollabs((data || []).map((r) => collabRowToPost(r, isKo)));
      setLoadingCollab(false);
      if (user?.id) {
        const { data: apps } = await supabase
          .from("collab_applications")
          .select("post_id")
          .eq("applicant_id", user.id);
        if (!cancelled && apps) setAppliedCollabIds(new Set(apps.map((a: any) => a.post_id)));
      }
    })();
    return () => { cancelled = true; };
  }, [isKo, user?.id]);

  // 협업 글 등록
  const handleCreateCollab = async () => {
    if (!isAuthenticated) { toast.error(t("community.writeRequiresLogin")); return; }
    const title = collabForm.title.trim();
    const description = collabForm.description.trim();
    if (title.length < 2 || description.length < 5) {
      toast.error(isKo ? "제목(2자+)과 설명(5자+)을 입력해주세요." : "Enter a title (2+) and description (5+).");
      return;
    }
    setSubmittingCollab(true);
    try {
      const roles = collabForm.roles.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);
      const { data, error } = await supabase
        .from("collab_posts")
        .insert({
          user_id: user!.id,
          author_name: profile?.display_name || user?.name || (isKo ? "크리에이터" : "Creator"),
          author_avatar: profile?.avatar_url || null,
          type: collabForm.type,
          title,
          description,
          roles,
          reward: collabForm.reward.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      setCollabs((prev) => [collabRowToPost(data, isKo), ...prev]);
      setShowCollabModal(false);
      setCollabForm({ type: "recruit", title: "", description: "", roles: "", reward: "" });
      toast.success(isKo ? "협업 글이 등록되었어요! 🤝" : "Your collab listing is posted! 🤝");
    } catch (e: any) {
      console.warn("[Collab] 등록 실패:", e?.message);
      toast.error(isKo ? "등록에 실패했어요. 다시 시도해주세요." : "Failed to post. Please try again.");
    } finally {
      setSubmittingCollab(false);
    }
  };

  // 협업 지원(관심) — apply_to_collab RPC (지원 기록 + 지원자수 + 작성자 알림)
  const handleApplyCollab = async (c: CollabPost) => {
    if (!isAuthenticated) { toast.error(t("community.writeRequiresLogin")); return; }
    if (c.ownerId === user?.id) { toast.info(isKo ? "내가 올린 글이에요." : "This is your own post."); return; }
    if (appliedCollabIds.has(c.id)) { toast.info(isKo ? "이미 관심을 보낸 글이에요." : "You already showed interest."); return; }
    try {
      const { data, error } = await supabase.rpc("apply_to_collab", { p_post_id: c.id, p_message: null });
      if (error) throw error;
      setAppliedCollabIds((prev) => new Set(prev).add(c.id));
      if (data === "already") {
        toast.info(isKo ? "이미 관심을 보낸 글이에요." : "You already showed interest.");
        return;
      }
      setCollabs((prev) => prev.map((p) => (p.id === c.id ? { ...p, applicants: p.applicants + 1 } : p)));
      toast.success(isKo ? `‘${c.author}’님에게 관심을 전했어요! 🤝` : `Interest sent to ${c.author}! 🤝`);
    } catch (e: any) {
      console.warn("[Collab] 지원 실패:", e?.message);
      toast.error(isKo ? "전송에 실패했어요. 다시 시도해주세요." : "Failed to send. Please try again.");
    }
  };

  // 협업 글 마감/재오픈 (작성자 전용)
  const handleToggleCollabStatus = async (c: CollabPost) => {
    const next = c.status === "open" ? "closed" : "open";
    const { error } = await supabase
      .from("collab_posts")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", c.id);
    if (error) { toast.error(isKo ? "변경에 실패했어요." : "Failed to update."); return; }
    setCollabs((prev) => prev.map((p) => (p.id === c.id ? { ...p, status: next } : p)));
    toast.success(next === "closed" ? (isKo ? "모집을 마감했어요." : "Marked as closed.") : (isKo ? "다시 열었어요." : "Reopened."));
  };

  // 지원자 목록 로드 (작성자가 '지원자 보기' 클릭 시)
  useEffect(() => {
    if (!viewApplicantsOf) { setApplicants([]); return; }
    let cancelled = false;
    (async () => {
      setLoadingApplicants(true);
      const { data, error } = await supabase
        .from("collab_applications")
        .select("applicant_name, message, created_at")
        .eq("post_id", viewApplicantsOf.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) console.warn("[Collab] 지원자 조회 실패:", error.message);
      setApplicants((data || []).map((a: any) => ({
        name: a.applicant_name || (isKo ? "크리에이터" : "Creator"),
        message: a.message || null,
        date: timeAgo(a.created_at, isKo),
      })));
      setLoadingApplicants(false);
    })();
    return () => { cancelled = true; };
  }, [viewApplicantsOf, isKo]);

  const toggleLike = (postId: string) => {
    setLikedPosts(prev => {
      const newSet = new Set(prev);
      newSet.has(postId) ? newSet.delete(postId) : newSet.add(postId);
      return newSet;
    });
  };

  const toggleBookmark = (postId: string) => {
    setBookmarkedPosts(prev => {
      const newSet = new Set(prev);
      newSet.has(postId) ? newSet.delete(postId) : newSet.add(postId);
      return newSet;
    });
  };

  const handleWritePost = async () => {
    if (!writeTitle.trim() || !writeContent.trim()) {
      toast.error(t("community.titleAndContentRequired"));
      return;
    }
    setSubmitting(true);
    try {
      // H10(2026-05-31): 실제 community_posts 에 저장 (RLS: auth.uid()=user_id)
      const { data, error } = await supabase
        .from("community_posts")
        .insert({
          user_id: user!.id,
          author_name: profile?.display_name || user?.name || t("community.anonymous"),
          author_avatar: profile?.avatar_url || null,
          title: writeTitle.trim(),
          content: writeContent.trim(),
          category: writeCategory,
        })
        .select()
        .single();
      if (error) throw error;
      setPosts(prev => [rowToPost(data, localeTag), ...prev]);
      setWriteTitle("");
      setWriteContent("");
      setWriteCategory("일반");
      setShowWriteModal(false);
      toast.success(t("community.submitSuccess"));
    } catch {
      toast.error(t("community.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const commentPost = commentPostId ? posts.find(p => p.id === commentPostId) : null;

  return (
    <div className="h-full overflow-y-auto bg-background relative">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-bold">{t("community.title")}</h2>
          <Button
            onClick={() => {
              if (!isAuthenticated) {
                toast.error(t("community.writeRequiresLogin"));
                return;
              }
              setShowWriteModal(true);
            }}
            className="gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 font-bold"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            {t("community.write")}
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-[#1c1c1e] p-1.5 rounded-2xl mb-6 border border-white/5 shadow-inner">
            {([
              { id: 'posts', label: t("community.tabPosts") },
              { id: 'challenges', label: t("community.tabChallenges") },
              { id: 'collab', label: t("community.tabCollab") },
            ] as { id: string; label: string }[]).map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={`relative py-3 rounded-xl transition-all duration-300 font-bold text-[13px] md:text-sm
                    ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}
                  data-[state=active]:bg-transparent data-[state=active]:shadow-none`}
                >
                  <span className="relative z-10 flex items-center justify-center">
                    {tab.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="community-active-tab"
                      className="absolute inset-0 bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#ec4899] rounded-xl shadow-lg shadow-[#8b5cf6]/30 -z-0"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>

          <TabsContent value="posts" className="mt-0">
            <div className="space-y-4 pb-6 md:pb-8">
              {loadingPosts && (
                <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#6366f1]" /></div>
              )}
              {!loadingPosts && posts.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t("community.emptyPosts", "아직 게시글이 없습니다. 첫 글을 작성해보세요!")}</p>
                </div>
              )}
              <AnimatePresence initial={false}>
                {posts.map((post) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    onClick={() => setSelectedPost(post)}
                    className="bg-card rounded-lg border border-border overflow-hidden cursor-pointer hover:border-[#6366f1]/50 transition-colors"
                  >
                    <div className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {post.avatar ? (
                            <img src={post.avatar} alt={post.author} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-white font-bold text-sm">{post.author.charAt(0)}</span>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{post.author}</p>
                          <p className="text-xs text-muted-foreground">{post.timestamp}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${CATEGORY_COLOR[post.category] || "bg-[#6366f1]/20 text-[#6366f1]"}`}>
                          {COMMUNITY_CATEGORY_KEY[post.category] ? t(COMMUNITY_CATEGORY_KEY[post.category]) : post.category}
                        </span>
                      </div>

                      <h3 className="mb-2 font-semibold">{post.title}</h3>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-3 whitespace-pre-line">
                        {post.content}
                      </p>

                      {post.image && (
                        <img
                          src={post.image}
                          alt={post.title}
                          className="w-full h-48 object-cover rounded-lg mb-3"
                        />
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-border">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleLike(post.id); }}
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Heart className={`w-5 h-5 ${likedPosts.has(post.id) ? 'fill-[#ef4444] text-[#ef4444]' : ''}`} />
                            <span>{post.likes + (likedPosts.has(post.id) ? 1 : 0)}</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setCommentPostId(post.id); }}
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <MessageCircle className="w-5 h-5" />
                            <span>{post.comments}</span>
                          </button>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleBookmark(post.id); }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Bookmark className={`w-5 h-5 ${bookmarkedPosts.has(post.id) ? 'fill-[#6366f1] text-[#6366f1]' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </TabsContent>

          <TabsContent value="challenges" className="mt-0">
            <div className="space-y-5 pb-6 md:pb-8">
              {/* 매월 정기 콘테스트 히어로 */}
              <div className="relative overflow-hidden rounded-2xl border border-[#8b5cf6]/30 bg-gradient-to-br from-[#1e1b4b] via-[#3b0764] to-[#0d0d14] p-5 md:p-7">
                {/* 장식 글로우 */}
                <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-[#8b5cf6]/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-[#ec4899]/10 blur-3xl" />
                <div className="relative">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white/10 border border-white/20 text-[#e9d5ff] backdrop-blur-sm">
                    <Trophy className="w-3.5 h-3.5 text-[#fbbf24]" />
                    {isKo ? "매월 정기 콘테스트" : "Monthly Contest"}
                  </span>
                  <h2 className="mt-3 text-xl md:text-3xl font-black text-white leading-tight">
                    {isKo ? "매달 열리는 AI 영상 챌린지" : "Monthly AI Video Challenge"}
                  </h2>
                  <p className="mt-1.5 text-sm text-purple-200/80 max-w-lg">
                    {isKo
                      ? "매월 새로운 테마가 열립니다. 누구나 무료로 참가하고, 우수작은 메인 피드에 노출돼요."
                      : "A new theme every month. Free to enter — top entries get featured on the home feed."}
                  </p>
                  {/* 상금 티어 */}
                  <div className="mt-4 grid grid-cols-3 gap-2 md:gap-3 max-w-md">
                    {[
                      { emoji: "🥇", rank: isKo ? "1등" : "1st", amount: isKo ? "30만원" : "₩300K", ring: "border-[#fbbf24]/40 bg-[#fbbf24]/10" },
                      { emoji: "🥈", rank: isKo ? "2등" : "2nd", amount: isKo ? "20만원" : "₩200K", ring: "border-white/20 bg-white/5" },
                      { emoji: "🥉", rank: isKo ? "3등" : "3rd", amount: isKo ? "10만원" : "₩100K", ring: "border-[#f59e0b]/30 bg-[#f59e0b]/10" },
                    ].map((p) => (
                      <div key={p.rank} className={`rounded-xl border ${p.ring} px-2 py-2.5 text-center backdrop-blur-sm`}>
                        <div className="text-lg md:text-xl leading-none">{p.emoji}</div>
                        <div className="mt-1 text-[10px] md:text-xs text-purple-200/70 font-medium">{p.rank}</div>
                        <div className="text-sm md:text-base font-extrabold text-white">{p.amount}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 챌린지 목록 */}
              {challenges.map((challenge) => {
                const status = getChallengeStatus(challenge);
                const daysLeft = getDaysLeft(challenge.deadline);
                const statusMeta = {
                  ongoing: { label: isKo ? `진행중 · D-${daysLeft}` : `Open · D-${daysLeft}`, cls: "bg-[#10b981]/90 text-white" },
                  upcoming: { label: isKo ? "오픈 예정" : "Coming soon", cls: "bg-[#6366f1]/90 text-white" },
                  ended: { label: isKo ? "마감" : "Closed", cls: "bg-white/15 text-white/70 backdrop-blur-sm" },
                }[status];
                return (
                <div
                  key={challenge.id}
                  onClick={() => setSelectedChallenge(challenge)}
                  className={`bg-card rounded-xl border border-border overflow-hidden group cursor-pointer hover:border-[#6366f1]/50 transition-colors ${status === "ended" ? "opacity-70" : ""}`}
                >
                  <div className="relative h-32 overflow-hidden">
                    <img src={challenge.image} alt={challenge.title} className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-300 ${status === "ended" ? "grayscale" : ""}`} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    {/* 상태 배지 */}
                    <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-md text-[11px] font-bold ${statusMeta.cls}`}>
                      {statusMeta.label}
                    </span>
                    <div className="absolute bottom-3 left-3 right-3">
                      <h3 className="text-white mb-1">{challenge.title}</h3>
                      <div className="flex items-center gap-3 text-white/80 text-sm">
                        <div className="flex items-center gap-1">
                          <Trophy className="w-4 h-4 text-[#fbbf24]" />
                          <span>{challenge.prize}</span>
                        </div>
                        <span>•</span>
                        <span>{t("community.participants", { count: challenge.participants })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t("community.deadlineLabel", { date: challenge.deadline })}</span>
                    <Button
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setSelectedChallenge(challenge); }}
                      className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
                    >
                      {t("community.viewDetail")}
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="collab" className="mt-0">
            <div className="space-y-5 pb-6 md:pb-8">
              {/* 협업 공간 히어로 */}
              <div className="relative overflow-hidden rounded-2xl border border-[#8b5cf6]/30 bg-gradient-to-br from-[#0f2027] via-[#1a1b3a] to-[#0d0d14] p-5 md:p-7">
                <div className="pointer-events-none absolute -top-16 -right-12 w-56 h-56 rounded-full bg-[#6366f1]/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-[#10b981]/10 blur-3xl" />
                <div className="relative">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white/10 border border-white/20 text-[#c4b5fd] backdrop-blur-sm">
                    <Handshake className="w-3.5 h-3.5 text-[#34d399]" />
                    {isKo ? "크리에이터 협업" : "Creator Collab"}
                  </span>
                  <h2 className="mt-3 text-xl md:text-3xl font-black text-white leading-tight">
                    {isKo ? "혼자 만들지 마세요. 함께 만들어요" : "Don't create alone — create together"}
                  </h2>
                  <p className="mt-1.5 text-sm text-gray-300/80 max-w-lg">
                    {isKo
                      ? "팀원을 모집하고, 재능을 나누고, 막히는 부분을 도와주는 크리에이터들의 협업 공간이에요."
                      : "A space for creators to recruit teammates, offer skills, and help each other out."}
                  </p>
                  <Button
                    onClick={() => {
                      if (!isAuthenticated) { toast.error(t("community.writeRequiresLogin")); return; }
                      setShowCollabModal(true);
                    }}
                    className="mt-4 gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 font-bold"
                    size="sm"
                  >
                    <Plus className="w-4 h-4" />
                    {isKo ? "협업 글 올리기" : "Post a listing"}
                  </Button>
                </div>
              </div>

              {/* 타입 필터 */}
              <div className="flex flex-wrap gap-2">
                {([
                  { id: "all" as const, label: isKo ? "전체" : "All" },
                  ...(Object.keys(COLLAB_TYPE_META) as CollabType[]).map((k) => ({ id: k, label: isKo ? COLLAB_TYPE_META[k].ko : COLLAB_TYPE_META[k].en })),
                ]).map((f) => {
                  const active = collabFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setCollabFilter(f.id)}
                      className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                        active
                          ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white border-transparent"
                          : "bg-card text-muted-foreground border-border hover:border-[#6366f1]/50"
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {/* 협업 글 목록 */}
              {loadingCollab ? (
                <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#6366f1]" /></div>
              ) : (() => {
                const filtered = collabs.filter((c) => collabFilter === "all" || c.type === collabFilter);
                if (filtered.length === 0) {
                  return (
                    <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
                      <Handshake className="w-9 h-9 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-foreground/80">
                        {collabFilter === "all"
                          ? (isKo ? "아직 협업 글이 없어요" : "No collab posts yet")
                          : (isKo ? "이 유형의 글이 아직 없어요" : "No posts of this type yet")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isKo ? "첫 번째 협업 글을 올려보세요!" : "Be the first to post a listing!"}
                      </p>
                    </div>
                  );
                }
                return (
                <div className="space-y-3">
                  {filtered.map((c) => {
                    const meta = COLLAB_TYPE_META[c.type];
                    const TypeIcon = meta.Icon;
                    const closed = c.status === "closed";
                    const isOwner = !!user?.id && c.ownerId === user.id;
                    const applied = appliedCollabIds.has(c.id);
                    return (
                    <div
                      key={c.id}
                      className={`bg-card rounded-xl border border-border p-4 transition-colors hover:border-[#6366f1]/40 ${closed ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        {c.avatar ? (
                          <img src={c.avatar} alt={c.author} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full flex-shrink-0 bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white font-bold">
                            {(c.author || "C").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {/* 타입 배지 + 상태 */}
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${meta.cls}`}>
                              <TypeIcon className="w-3 h-3" />
                              {isKo ? meta.ko : meta.en}
                            </span>
                            {closed && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-white/10 text-white/60">
                                {isKo ? "마감" : "Closed"}
                              </span>
                            )}
                            {isOwner && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#6366f1]/15 text-[#a5b4fc]">
                                {isKo ? "내 글" : "Mine"}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">· {c.timestamp}</span>
                          </div>
                          {/* 제목 */}
                          <h3 className="font-bold text-foreground leading-snug">{c.title}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{c.author}</p>
                          {/* 설명 */}
                          <p className="text-sm text-foreground/80 mt-2 whitespace-pre-line line-clamp-3">{c.description}</p>
                          {/* 필요 역할 */}
                          {c.roles.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {c.roles.map((role) => (
                                <span key={role} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#6366f1]/10 text-[#a5b4fc] border border-[#6366f1]/20">
                                  {role}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* 하단: 보상 + 지원자 + CTA */}
                          <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border/60">
                            <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
                              {c.reward && <span className="flex items-center gap-1 truncate">🎁 {c.reward}</span>}
                              <span className="flex items-center gap-1 flex-shrink-0"><Users className="w-3.5 h-3.5" />{isKo ? `${c.applicants}명 관심` : `${c.applicants} interested`}</span>
                            </div>
                            {isOwner ? (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Button size="sm" variant="outline" onClick={() => setViewApplicantsOf(c)} className="border-[#6366f1]/40">
                                  {isKo ? "지원자 보기" : "Applicants"}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleToggleCollabStatus(c)} className="border-border">
                                  {closed ? (isKo ? "다시 열기" : "Reopen") : (isKo ? "마감하기" : "Close")}
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                disabled={closed || applied}
                                onClick={() => handleApplyCollab(c)}
                                className="flex-shrink-0 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] disabled:opacity-50"
                              >
                                {closed
                                  ? (isKo ? "마감" : "Closed")
                                  : applied
                                  ? (isKo ? "관심 보냄 ✓" : "Interested ✓")
                                  : c.type === "help"
                                  ? (isKo ? "도와주기" : "Help out")
                                  : (isKo ? "연락하기" : "Contact")}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
                );
              })()}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Footer onNavigate={onNavigate || (() => {})} />

      {/* 댓글 바텀시트 */}
      <AnimatePresence>
        {commentPostId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCommentPostId(null)}
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden"
              style={{ maxHeight: "75vh" }}
            >
              <CommentPanel
                postId={commentPostId}
                title={commentPost?.title}
                onClose={() => setCommentPostId(null)}
                mode="sheet"
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 게시글 상세 페이지 */}
      <AnimatePresence>
        {selectedPost && (
          <CommunityPostDetail
            post={selectedPost}
            isLiked={likedPosts.has(selectedPost.id)}
            isBookmarked={bookmarkedPosts.has(selectedPost.id)}
            onLike={() => toggleLike(selectedPost.id)}
            onBookmark={() => toggleBookmark(selectedPost.id)}
            onClose={() => setSelectedPost(null)}
          />
        )}
      </AnimatePresence>

      {/* 챌린지 상세 페이지 */}
      <AnimatePresence
        onExitComplete={() => {
          if (pendingParticipateRef.current) {
            const c = pendingParticipateRef.current;
            pendingParticipateRef.current = null;
            onChallengeParticipate?.(c);
          }
        }}
      >
        {selectedChallenge && (
          <CommunityChallengeDetail
            challenge={selectedChallenge}
            onClose={() => setSelectedChallenge(null)}
            onParticipate={handleChallengeParticipate}
            onEntryClick={onPlayVideo}
          />
        )}
      </AnimatePresence>

      {/* 글쓰기 모달 */}
      <AnimatePresence>
        {showWriteModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWriteModal(false)}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-[#1a1a1c] rounded-2xl border border-white/10 p-5 max-w-lg mx-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">{t("community.writeModalTitle")}</h3>
                <button onClick={() => setShowWriteModal(false)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 카테고리 선택 */}
              <div className="flex flex-wrap gap-2 mb-4">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setWriteCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      writeCategory === cat
                        ? "bg-[#6366f1] text-white"
                        : "bg-white/5 text-gray-400 hover:bg-white/10"
                    }`}
                  >
                    {COMMUNITY_CATEGORY_KEY[cat] ? t(COMMUNITY_CATEGORY_KEY[cat]) : cat}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder={t("community.titlePlaceholder")}
                value={writeTitle}
                onChange={e => setWriteTitle(e.target.value)}
                maxLength={100}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#6366f1] transition-colors mb-3"
              />

              <textarea
                placeholder={t("community.contentPlaceholder")}
                value={writeContent}
                onChange={e => setWriteContent(e.target.value)}
                maxLength={2000}
                rows={5}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#6366f1] transition-colors resize-none mb-4"
              />

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">{writeContent.length}/2000</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowWriteModal(false)} className="border-white/10">
                    {t("community.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleWritePost}
                    disabled={submitting || !writeTitle.trim() || writeContent.trim().length < 10}
                    className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] gap-2"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {t("community.submit")}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 협업 글 작성 모달 */}
      <AnimatePresence>
        {showCollabModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowCollabModal(false)}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-[#1a1a1c] rounded-2xl border border-white/10 p-5 max-w-lg mx-auto shadow-2xl max-h-[88vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">{isKo ? "협업 글 올리기" : "Post a collab listing"}</h3>
                <button onClick={() => setShowCollabModal(false)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 유형 선택 */}
              <p className="text-xs font-semibold text-gray-400 mb-2">{isKo ? "어떤 글인가요?" : "What kind of post?"}</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {(Object.keys(COLLAB_TYPE_META) as CollabType[]).map((k) => {
                  const m = COLLAB_TYPE_META[k];
                  const MIcon = m.Icon;
                  const sel = collabForm.type === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setCollabForm((f) => ({ ...f, type: k }))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                        sel ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white border-transparent" : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <MIcon className="w-4 h-4" />
                      {isKo ? m.ko : m.en}
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                placeholder={isKo ? "제목 (예: SF 단편 음악 담당 구해요)" : "Title (e.g. Looking for a music partner)"}
                value={collabForm.title}
                onChange={(e) => setCollabForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={200}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#6366f1] transition-colors mb-3"
              />
              <textarea
                placeholder={isKo ? "어떤 협업을 원하는지, 무엇을 도와줄 수 있는지 자세히 적어주세요." : "Describe the collaboration you're looking for or offering."}
                value={collabForm.description}
                onChange={(e) => setCollabForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={5000}
                rows={5}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#6366f1] transition-colors resize-none mb-3"
              />
              <input
                type="text"
                placeholder={isKo ? "필요/제공 역할 (쉼표로 구분: 음악, 편집, 시나리오)" : "Roles (comma-separated: music, editing, script)"}
                value={collabForm.roles}
                onChange={(e) => setCollabForm((f) => ({ ...f, roles: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#6366f1] transition-colors mb-3"
              />
              <input
                type="text"
                placeholder={isKo ? "보상 (예: 수익 배분, 무급/포트폴리오, 건당 협의)" : "Reward (e.g. revenue share, unpaid, paid per piece)"}
                value={collabForm.reward}
                onChange={(e) => setCollabForm((f) => ({ ...f, reward: e.target.value }))}
                maxLength={120}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#6366f1] transition-colors mb-4"
              />

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowCollabModal(false)} className="border-white/10">
                  {t("community.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateCollab}
                  disabled={submittingCollab || collabForm.title.trim().length < 2 || collabForm.description.trim().length < 5}
                  className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] gap-2"
                >
                  {submittingCollab ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {isKo ? "등록" : "Post"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 지원자 목록 모달 (작성자 전용) */}
      <AnimatePresence>
        {viewApplicantsOf && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setViewApplicantsOf(null)}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-[#1a1a1c] rounded-2xl border border-white/10 p-5 max-w-md mx-auto shadow-2xl max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-white">{isKo ? "관심 보낸 크리에이터" : "Interested creators"}</h3>
                <button onClick={() => setViewApplicantsOf(null)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-4 line-clamp-1">「{viewApplicantsOf.title}」</p>

              {loadingApplicants ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#6366f1]" /></div>
              ) : applicants.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {isKo ? "아직 관심을 보낸 분이 없어요." : "No one has shown interest yet."}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {applicants.map((a, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="w-9 h-9 rounded-full flex-shrink-0 bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white font-bold text-sm">
                        {a.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-white text-sm truncate">{a.name}</p>
                          <span className="text-[11px] text-gray-500 flex-shrink-0">{a.date}</span>
                        </div>
                        {a.message && <p className="text-xs text-gray-300 mt-1">{a.message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
                {isKo
                  ? "💡 관심을 보낸 분과 연락하려면 해당 크리에이터의 채널/프로필에서 연락해 주세요. (DM 기능은 준비 중이에요)"
                  : "💡 To get in touch, reach out via the creator's channel/profile for now. (DM is coming soon)"}
              </p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
