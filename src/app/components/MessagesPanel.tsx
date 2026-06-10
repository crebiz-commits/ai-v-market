import { useState, useEffect, useCallback, useRef } from "react";
import { X, MessageSquare, ArrowLeft, Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "react-i18next";

interface DmConversation {
  conversationId: string;
  otherId: string;
  otherName: string;
  otherAvatar: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

interface DmMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

function timeAgo(dateStr: string | null, isKo: boolean): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
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
  if (src) return <img src={src} alt={name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />;
  return (
    <div className="w-9 h-9 rounded-full flex-shrink-0 bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white font-bold text-sm">
      {(name || "C").charAt(0).toUpperCase()}
    </div>
  );
}

interface MessagesPanelProps {
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
  /** 외부에서 특정 대화로 바로 진입 (협업 연락하기 / 알림 딥링크) */
  initialConversationId?: string | null;
  onInitialConsumed?: () => void;
}

export function MessagesPanel({ onClose, onUnreadCountChange, initialConversationId, onInitialConsumed }: MessagesPanelProps) {
  const { i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  const { user, isAuthenticated } = useAuth();
  const meId = user?.id || "";

  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [active, setActive] = useState<DmConversation | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const channelRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const recomputeUnread = useCallback((list: DmConversation[]) => {
    onUnreadCountChange?.(list.reduce((s, c) => s + (c.unread || 0), 0));
  }, [onUnreadCountChange]);

  const loadList = useCallback(async () => {
    if (!isAuthenticated) { setLoadingList(false); return; }
    setLoadingList(true);
    const { data, error } = await supabase.rpc("dm_list");
    if (error) console.warn("[DM] 목록 조회 실패:", error.message);
    const list: DmConversation[] = (data || []).map((r: any) => ({
      conversationId: r.conversation_id,
      otherId: r.other_id,
      otherName: r.other_name || (isKo ? "크리에이터" : "Creator"),
      otherAvatar: r.other_avatar || null,
      lastMessage: r.last_message || null,
      lastMessageAt: r.last_message_at || null,
      unread: r.unread || 0,
    }));
    setConversations(list);
    recomputeUnread(list);
    setLoadingList(false);
    return list;
  }, [isAuthenticated, isKo, recomputeUnread]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  };

  const openThread = useCallback(async (conv: DmConversation) => {
    setActive(conv);
    setMessages([]);
    setLoadingMsgs(true);
    const { data, error } = await supabase
      .from("dm_messages")
      .select("id, sender_id, body, created_at")
      .eq("conversation_id", conv.conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) console.warn("[DM] 메시지 조회 실패:", error.message);
    setMessages((data || []).map((m: any) => ({ id: m.id, senderId: m.sender_id, body: m.body, createdAt: m.created_at })));
    setLoadingMsgs(false);
    scrollToBottom();

    // 읽음 처리 + 로컬 unread 0
    if (conv.unread > 0) {
      void supabase.rpc("dm_mark_read", { p_conversation: conv.conversationId });
      setConversations((prev) => {
        const next = prev.map((c) => (c.conversationId === conv.conversationId ? { ...c, unread: 0 } : c));
        recomputeUnread(next);
        return next;
      });
    }

    // 실시간 구독 (이 대화의 새 메시지)
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel(`dm-${conv.conversationId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${conv.conversationId}` },
        (payload: any) => {
          const m = payload.new;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { id: m.id, senderId: m.sender_id, body: m.body, createdAt: m.created_at }]));
          scrollToBottom();
          if (m.sender_id !== meId) void supabase.rpc("dm_mark_read", { p_conversation: conv.conversationId });
        })
      .subscribe();
  }, [meId, recomputeUnread]);

  const backToList = useCallback(() => {
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    setActive(null);
    void loadList();
  }, [loadList]);

  const send = async () => {
    const body = input.trim();
    if (!body || !active || sending) return;
    setSending(true);
    const { data, error } = await supabase.rpc("dm_send", { p_conversation: active.conversationId, p_body: body });
    if (error) {
      console.warn("[DM] 전송 실패:", error.message);
      setSending(false);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const newMsg: DmMessage = { id: row?.id || `tmp-${Date.now()}`, senderId: meId, body, createdAt: row?.created_at || new Date().toISOString() };
    setMessages((prev) => (prev.some((x) => x.id === newMsg.id) ? prev : [...prev, newMsg]));
    setInput("");
    setSending(false);
    scrollToBottom();
    setConversations((prev) => prev.map((c) => (c.conversationId === active.conversationId ? { ...c, lastMessage: body, lastMessageAt: newMsg.createdAt } : c)));
  };

  // 최초 로드 + 딥링크 진입
  useEffect(() => {
    (async () => {
      const list = await loadList();
      if (initialConversationId && list) {
        const conv = list.find((c) => c.conversationId === initialConversationId);
        if (conv) void openThread(conv);
        onInitialConsumed?.();
      }
    })();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-full bg-[#111] border-l border-white/10 w-full md:w-80">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-[#8b5cf6]" /><span className="font-semibold text-white">{isKo ? "메시지" : "Messages"}</span></div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm gap-2">
          <MessageSquare className="w-10 h-10 text-gray-600" />
          {isKo ? "로그인하면 메시지를 주고받을 수 있어요." : "Sign in to use messages."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#111] border-l border-white/10 w-full md:w-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        {active ? (
          <button onClick={backToList} className="flex items-center gap-2 min-w-0">
            <ArrowLeft className="w-5 h-5 text-gray-300 flex-shrink-0" />
            <Avatar name={active.otherName} src={active.otherAvatar} />
            <span className="font-semibold text-white truncate">{active.otherName}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#8b5cf6]" />
            <span className="font-semibold text-white">{isKo ? "메시지" : "Messages"}</span>
          </div>
        )}
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white flex-shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 대화 목록 */}
      {!active ? (
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {loadingList ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" /></div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <MessageSquare className="w-10 h-10 text-gray-600 mb-3" />
              <p className="text-gray-500 text-sm">{isKo ? "아직 대화가 없어요." : "No conversations yet."}</p>
              <p className="text-gray-600 text-xs mt-1">{isKo ? "협업 글에서 ‘연락하기’로 대화를 시작해보세요." : "Start one via ‘Contact’ on a collab post."}</p>
            </div>
          ) : (
            conversations.map((c) => (
              <button key={c.conversationId} onClick={() => openThread(c)}
                className={`w-full flex gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 ${c.unread > 0 ? "bg-white/[0.03]" : ""}`}>
                <Avatar name={c.otherName} src={c.otherAvatar} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${c.unread > 0 ? "text-white font-semibold" : "text-gray-200"}`}>{c.otherName}</p>
                    <span className="text-[11px] text-gray-600 flex-shrink-0">{timeAgo(c.lastMessageAt, isKo)}</span>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${c.unread > 0 ? "text-gray-300" : "text-gray-500"}`}>{c.lastMessage || (isKo ? "새 대화" : "New conversation")}</p>
                </div>
                {c.unread > 0 && <span className="self-center px-1.5 py-0.5 bg-[#ef4444] rounded-full text-[10px] text-white font-bold flex-shrink-0">{c.unread}</span>}
              </button>
            ))
          )}
        </div>
      ) : (
        /* 대화 스레드 */
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide px-3 py-3 space-y-2">
            {loadingMsgs ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" /></div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-600 text-xs py-10">{isKo ? "첫 메시지를 보내보세요 👋" : "Send the first message 👋"}</div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((m) => {
                  const mine = m.senderId === meId;
                  return (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-snug whitespace-pre-wrap break-words ${
                        mine ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-br-sm" : "bg-white/10 text-gray-100 rounded-bl-sm"}`}>
                        {m.body}
                        <span className={`block text-[10px] mt-1 ${mine ? "text-white/60" : "text-gray-500"}`}>{timeAgo(m.createdAt, isKo)}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
          {/* 입력창 */}
          <div className="flex items-end gap-2 p-3 border-t border-white/10 flex-shrink-0">
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
        </>
      )}
    </div>
  );
}
