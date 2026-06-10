import { useState, useEffect, useRef, useCallback } from "react";
import { X, ArrowLeft, Send, Loader2, MessageSquare, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";

interface ThreadRow {
  threadId: string;
  otherId: string;
  otherName: string;
  otherAvatar: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

interface ThreadMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface CollabInquiryPost {
  id: string;
  title: string;
  ownerId?: string;
  author: string;
  avatar: string;
}

function timeAgo(iso: string | null, isKo: boolean): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (isKo) {
    if (diff < 60) return "방금";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
  }
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) return <img src={src} alt={name} className="w-9 h-9 rounded-full flex-shrink-0 object-cover" />;
  return (
    <div className="w-9 h-9 rounded-full flex-shrink-0 bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white font-bold text-sm">
      {(name || "C").charAt(0).toUpperCase()}
    </div>
  );
}

interface Props {
  post: CollabInquiryPost;
  meId: string;
  isKo: boolean;
  onClose: () => void;
  onUnreadConsumed?: () => void;   // 읽음 처리 후 카드 등 상위 갱신용(선택)
}

export function CollabInquiryModal({ post, meId, isKo, onClose, onUnreadConsumed }: Props) {
  const isAuthor = !!meId && post.ownerId === meId;

  const [view, setView] = useState<"list" | "thread">(isAuthor ? "list" : "thread");
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(isAuthor);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [otherName, setOtherName] = useState<string>(post.author);
  const [otherAvatar, setOtherAvatar] = useState<string | null>(post.avatar || null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const channelRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
  };

  const subscribe = (threadId: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel(`collab-thread-${threadId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "collab_messages", filter: `thread_id=eq.${threadId}` },
        (payload: any) => {
          const m = payload.new;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { id: m.id, senderId: m.sender_id, body: m.body, createdAt: m.created_at }]));
          scrollToBottom();
          if (m.sender_id !== meId) void supabase.rpc("collab_thread_mark_read", { p_thread_id: threadId });
        })
      .subscribe();
  };

  const loadMessages = useCallback(async (threadId: string) => {
    setLoadingMsgs(true);
    const { data, error } = await supabase
      .from("collab_messages")
      .select("id, sender_id, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) console.warn("[Collab DM] 메시지 조회 실패:", error.message);
    setMessages((data || []).map((m: any) => ({ id: m.id, senderId: m.sender_id, body: m.body, createdAt: m.created_at })));
    setLoadingMsgs(false);
    scrollToBottom();
    void supabase.rpc("collab_thread_mark_read", { p_thread_id: threadId });
    onUnreadConsumed?.();
  }, [onUnreadConsumed]);

  const openThread = (t: { threadId: string; otherName: string; otherAvatar: string | null }) => {
    setActiveThreadId(t.threadId);
    setOtherName(t.otherName);
    setOtherAvatar(t.otherAvatar);
    setMessages([]);
    setView("thread");
    void loadMessages(t.threadId);
    subscribe(t.threadId);
  };

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    const { data, error } = await supabase.rpc("collab_threads_for", { p_post_id: post.id });
    if (error) console.warn("[Collab DM] 스레드 목록 실패:", error.message);
    setThreads((data || []).map((r: any) => ({
      threadId: r.thread_id, otherId: r.other_id,
      otherName: r.other_name || (isKo ? "크리에이터" : "Creator"),
      otherAvatar: r.other_avatar || null,
      lastMessage: r.last_message || null, lastMessageAt: r.last_message_at || null,
      unread: r.unread || 0,
    })));
    setLoadingThreads(false);
  }, [post.id, isKo]);

  // 진입: 작성자 → 스레드 목록 / 문의자 → 내 스레드 바로 열기
  useEffect(() => {
    if (isAuthor) {
      void loadThreads();
    } else {
      (async () => {
        const { data, error } = await supabase.rpc("collab_inquire", { p_post_id: post.id });
        if (error || !data) {
          console.warn("[Collab DM] 문의 시작 실패:", error?.message);
          setStartError(isKo ? "문의를 시작하지 못했어요." : "Couldn't start the inquiry.");
          return;
        }
        openThread({ threadId: data as string, otherName: post.author, otherAvatar: post.avatar || null });
      })();
    }
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    const body = input.trim();
    if (!body || !activeThreadId || sending) return;
    setSending(true);
    const { data, error } = await supabase.rpc("collab_thread_send", { p_thread_id: activeThreadId, p_body: body });
    if (error) { console.warn("[Collab DM] 전송 실패:", error.message); setSending(false); return; }
    const row = Array.isArray(data) ? data[0] : data;
    const msg: ThreadMessage = { id: row?.id || `tmp-${input.length}-${body.length}`, senderId: meId, body, createdAt: row?.created_at || new Date().toISOString() };
    setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]));
    setInput("");
    setSending(false);
    scrollToBottom();
  };

  const backToList = () => {
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    setActiveThreadId(null);
    setView("list");
    void loadThreads();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 z-[55] backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-x-3 bottom-3 top-auto md:inset-x-0 md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:mx-auto md:max-w-md z-[56] h-[78vh] md:h-[70vh] bg-[#141416] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 flex-shrink-0">
          {view === "thread" && isAuthor ? (
            <button onClick={backToList} className="p-1 -ml-1 rounded-full hover:bg-white/10 text-gray-300"><ArrowLeft className="w-5 h-5" /></button>
          ) : null}
          {view === "thread" ? (
            <>
              <Avatar name={otherName} src={otherAvatar} />
              <div className="min-w-0">
                <p className="font-semibold text-white truncate leading-tight">{otherName}</p>
                <p className="text-[11px] text-gray-500 truncate flex items-center gap-1"><Lock className="w-2.5 h-2.5" />{isKo ? "비공개 문의" : "Private inquiry"} · 「{post.title}」</p>
              </div>
            </>
          ) : (
            <div className="min-w-0">
              <p className="font-semibold text-white truncate leading-tight">{isKo ? "받은 문의" : "Inquiries"}</p>
              <p className="text-[11px] text-gray-500 truncate">「{post.title}」</p>
            </div>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white flex-shrink-0"><X className="w-5 h-5" /></button>
        </div>

        {/* 본문 */}
        {view === "list" ? (
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {loadingThreads ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#6366f1]" /></div>
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <MessageSquare className="w-9 h-9 text-gray-600 mb-3" />
                <p className="text-sm text-gray-400">{isKo ? "아직 받은 문의가 없어요." : "No inquiries yet."}</p>
              </div>
            ) : (
              threads.map((t) => (
                <button key={t.threadId} onClick={() => openThread(t)}
                  className={`w-full flex gap-3 px-4 py-3 hover:bg-white/5 text-left border-b border-white/5 ${t.unread > 0 ? "bg-white/[0.03]" : ""}`}>
                  <Avatar name={t.otherName} src={t.otherAvatar} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${t.unread > 0 ? "text-white font-semibold" : "text-gray-200"}`}>{t.otherName}</p>
                      <span className="text-[11px] text-gray-600 flex-shrink-0">{timeAgo(t.lastMessageAt, isKo)}</span>
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${t.unread > 0 ? "text-gray-300" : "text-gray-500"}`}>{t.lastMessage || (isKo ? "새 문의" : "New inquiry")}</p>
                  </div>
                  {t.unread > 0 && <span className="self-center px-1.5 py-0.5 bg-[#ef4444] rounded-full text-[10px] text-white font-bold flex-shrink-0">{t.unread}</span>}
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide px-3 py-3 space-y-2">
              {startError ? (
                <div className="text-center text-red-400 text-sm py-10">{startError}</div>
              ) : loadingMsgs ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#6366f1]" /></div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-600 text-xs py-10">
                  {isKo ? "첫 문의 메시지를 보내보세요 👋\n작성자와 나만 볼 수 있어요." : "Send your first message 👋\nOnly you and the author can see this."}
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((m) => {
                    const mine = m.senderId === meId;
                    return (
                      <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-snug whitespace-pre-wrap break-words ${mine ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-br-sm" : "bg-white/10 text-gray-100 rounded-bl-sm"}`}>
                          {m.body}
                          <span className={`block text-[10px] mt-1 ${mine ? "text-white/60" : "text-gray-500"}`}>{timeAgo(m.createdAt, isKo)}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
            {!startError && (
              <div className="flex items-end gap-2 p-3 border-t border-white/10 flex-shrink-0 bg-[#141416]">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder={isKo ? "메시지 입력…" : "Message…"}
                  rows={1}
                  className="flex-1 resize-none max-h-28 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#6366f1]"
                />
                <button onClick={() => void send()} disabled={!input.trim() || sending}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white disabled:opacity-40 flex-shrink-0">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </>
  );
}
