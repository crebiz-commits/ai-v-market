// 사용자 관리 페이지 (Phase 10.6)
import { useEffect, useState } from "react";
import { Loader2, Search, ShieldAlert, Crown, ShieldCheck, Ban, CheckCircle2, Users } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  subscription_tier: string;
  is_admin: boolean;
  is_suspended: boolean;
  suspended_reason: string | null;
  created_at: string;
  video_count: number;
  total_payments: number;
}

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "premium", label: "프리미엄" },
  { key: "suspended", label: "정지" },
  { key: "admins", label: "어드민" },
];

export function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE = 50;

  const load = async (append = false) => {
    const off = append ? users.length : 0;
    if (append) setLoadingMore(true); else setLoading(true);
    const { data, error } = await supabase.rpc("admin_search_users", {
      p_query: query || null,
      p_filter: filter,
      p_limit: PAGE,
      p_offset: off,
    });
    if (error) {
      toast.error("사용자 목록 조회 실패: " + error.message);
      if (!append) setUsers([]);
    } else {
      const rows = (data || []) as UserRow[];
      setUsers((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore(rows.length === PAGE);
    }
    setLoading(false);
    setLoadingMore(false);
  };

  useEffect(() => { load(); }, [filter]);

  const suspend = async (u: UserRow) => {
    const reason = prompt(`'${u.display_name || u.email}' 사용자를 정지하는 이유:`);
    if (reason === null) return;
    setProcessingId(u.id);
    const { error } = await supabase.rpc("admin_suspend_user", { p_user_id: u.id, p_reason: reason });
    setProcessingId(null);
    if (error) return toast.error("정지 실패: " + error.message);
    toast.success("정지 처리됨");
    load();
  };

  const unsuspend = async (u: UserRow) => {
    if (!confirm(`'${u.display_name || u.email}' 정지를 해제하시겠습니까?`)) return;
    setProcessingId(u.id);
    const { error } = await supabase.rpc("admin_unsuspend_user", { p_user_id: u.id });
    setProcessingId(null);
    if (error) return toast.error("해제 실패: " + error.message);
    toast.success("정지 해제됨");
    load();
  };

  const toggleAdmin = async (u: UserRow) => {
    const newRole = !u.is_admin;
    if (!confirm(`'${u.display_name || u.email}' 에게 어드민 권한을 ${newRole ? "부여" : "회수"}하시겠습니까?`)) return;
    setProcessingId(u.id);
    const { error } = await supabase.rpc("admin_set_admin_role", { p_user_id: u.id, p_is_admin: newRole });
    setProcessingId(null);
    if (error) return toast.error("권한 변경 실패: " + error.message);
    toast.success(newRole ? "어드민 부여됨" : "어드민 회수됨");
    load();
  };

  return (
    <div>
      {/* 검색 + 필터 */}
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="input-base pl-9 w-full"
            placeholder="이름 또는 이메일 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
        </div>
        <Button onClick={() => load()} disabled={loading}>검색</Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f.key ? "bg-[#6366f1] text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >{f.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>해당 조건의 사용자가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start gap-3">
                <UserAvatar src={u.avatar_url} name={u.display_name} className="w-12 h-12" fallbackClassName="text-lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">{u.display_name || "이름 없음"}</span>
                    {u.subscription_tier === "premium" && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold flex items-center gap-1">
                        <Crown className="w-3 h-3" />PREMIUM
                      </span>
                    )}
                    {u.is_admin && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6366f1]/15 text-[#8b5cf6] font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />어드민
                      </span>
                    )}
                    {u.is_suspended && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />정지
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{u.email}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1.5">
                    <span>영상 {u.video_count}개</span>
                    <span>결제 ₩{u.total_payments.toLocaleString()}</span>
                    <span>가입 {new Date(u.created_at).toLocaleDateString("ko-KR")}</span>
                  </div>
                  {u.is_suspended && u.suspended_reason && (
                    <p className="text-xs text-red-400/80 mt-1">정지 사유: {u.suspended_reason}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {u.is_suspended ? (
                    <Button size="sm" variant="outline" onClick={() => unsuspend(u)} disabled={processingId === u.id} className="gap-1 text-green-400 border-green-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" />해제
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => suspend(u)} disabled={processingId === u.id} className="gap-1 text-red-400 border-red-500/30">
                      <Ban className="w-3.5 h-3.5" />정지
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => toggleAdmin(u)} disabled={processingId === u.id} className="gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {u.is_admin ? "어드민 회수" : "어드민 부여"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => load(true)} disabled={loadingMore} className="gap-1.5">
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : "더 보기"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
