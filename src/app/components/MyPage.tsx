import { useState, useEffect, useMemo } from "react";
import { User, ShoppingBag, CreditCard, Settings, LogOut, TrendingUp, DollarSign, Loader2, Bell, ChevronRight, X, Eye, EyeOff, Lock, Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { supabase } from "../utils/supabaseClient";

interface Purchase {
  id: string;
  thumbnail: string;
  title: string;
  license: string;
  price: number;
  date: string;
  status: string;
}

interface MyProduct {
  id: string;
  thumbnail: string;
  title: string;
  views: number;
  sales: number;
  revenue: number;
  status: string;
}

interface MyPageProps {
  onSignInClick?: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};

export function MyPage({ onSignInClick }: MyPageProps) {
  const [activeTab, setActiveTab] = useState("profile");
  const { user, signOut, isAuthenticated } = useAuth();
  const [purchaseHistory, setPurchaseHistory] = useState<Purchase[]>([]);
  const [myProducts, setMyProducts] = useState<MyProduct[]>([]);
  const [monthlySales, setMonthlySales] = useState<{month: string, sales: number}[]>([]);
  const [loading, setLoading] = useState(true);

  // 프로필 편집 모달
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // 비밀번호 변경 모달
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPwNew, setShowPwNew] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const fetchMyData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: purchaseData, error: purchaseError } = await supabase
        .from('orders')
        .select('*, videos(title, thumbnail)')
        .eq('buyer_id', user.id);

      if (purchaseError) throw purchaseError;

      if (purchaseData) {
        setPurchaseHistory(purchaseData.map((item: any) => ({
          id: item.id,
          thumbnail: item.videos?.thumbnail || '',
          title: item.videos?.title || 'Unknown Video',
          license: item.license_type,
          price: item.amount,
          date: new Date(item.created_at).toLocaleDateString('ko-KR'),
          status: "다운로드 가능"
        })));
      }

      const { data: videoData, error: videoError } = await supabase
        .from('videos')
        .select('*, orders(amount, created_at)')
        .eq('creator_id', user.id);

      if (videoError) throw videoError;

      if (videoData) {
        const products = videoData.map((item: any) => {
          const salesCount = item.orders?.length || 0;
          const revenue = (item.orders || []).reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
          return {
            id: item.id,
            thumbnail: item.thumbnail,
            title: item.title,
            views: parseInt(item.views || "0"),
            sales: salesCount,
            revenue: revenue,
            status: item.status || "판매중"
          };
        });
        setMyProducts(products);

        const monthMap: Record<string, number> = {};
        videoData.forEach((video: any) => {
          (video.orders || []).forEach((order: any) => {
            const date = new Date(order.created_at);
            const key = `${date.getMonth() + 1}월`;
            monthMap[key] = (monthMap[key] || 0) + (order.amount || 0);
          });
        });

        const chartData = Object.entries(monthMap).map(([month, sales]) => ({
          month,
          sales
        })).sort((a, b) => parseInt(a.month) - parseInt(b.month));

        if (chartData.length === 0) {
          const defaultData = [];
          const now = new Date();
          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            defaultData.push({ month: `${d.getMonth() + 1}월`, sales: 0 });
          }
          setMonthlySales(defaultData);
        } else {
          setMonthlySales(chartData);
        }
      }
    } catch (error) {
      console.error("Error fetching MyPage data:", error);
      toast.error("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchMyData();
    }
  }, [isAuthenticated, user?.id]);

  const totalRevenue = useMemo(() => myProducts.reduce((sum, p) => sum + p.revenue, 0), [myProducts]);
  const totalSales = useMemo(() => myProducts.reduce((sum, p) => sum + p.sales, 0), [myProducts]);
  const platformFee = totalRevenue * 0.15;
  const expectedPayout = totalRevenue - platformFee;

  const handleSaveProfile = async () => {
    if (!editName.trim()) { toast.error("이름을 입력해주세요."); return; }
    setSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { name: editName.trim() } });
      if (error) throw error;
      toast.success("프로필이 업데이트됐습니다!");
      setShowProfileEdit(false);
    } catch (err: any) {
      toast.error(err.message || "저장에 실패했습니다.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pwNew.trim()) { toast.error("새 비밀번호를 입력해주세요."); return; }
    if (pwNew.length < 6) { toast.error("비밀번호는 6자 이상이어야 합니다."); return; }
    if (pwNew !== pwConfirm) { toast.error("새 비밀번호가 일치하지 않습니다."); return; }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw error;
      toast.success("비밀번호가 변경됐습니다!");
      setPwNew(""); setPwConfirm("");
      setShowPasswordChange(false);
    } catch (err: any) {
      toast.error(err.message || "비밀번호 변경에 실패했습니다.");
    } finally {
      setSavingPassword(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="h-full flex items-center justify-center bg-background p-6">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, type: "spring" }}
          className="text-center max-w-md mx-auto"
        >
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-24 h-24 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] mx-auto mb-6 flex items-center justify-center shadow-[0_10px_30px_rgba(99,102,241,0.4)] border border-white/20"
          >
            <User className="w-12 h-12 text-white" />
          </motion.div>
          <h2 className="text-3xl font-extrabold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">로그인이 필요합니다</h2>
          <p className="text-muted-foreground mb-8 text-[15px]">
            마이페이지를 이용하려면 먼저 로그인해주세요.<br/>
            데스크톱에서는 우측 상단의 로그인 버튼을 클릭하세요.
          </p>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button 
              onClick={onSignInClick}
              className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 transition-opacity py-7 text-lg font-bold shadow-[0_10px_20px_-10px_rgba(99,102,241,0.5)] border border-white/10 rounded-xl"
            >
              로그인 / 회원가입
            </Button>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="mx-auto mb-4 w-10 h-10 text-[#6366f1]"
          >
            <Loader2 className="w-10 h-10" />
          </motion.div>
          <p className="text-muted-foreground font-medium">내 정보를 불러오는 중...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] selection:bg-[#6366f1]/30 pb-20">
      <div className="max-w-6xl mx-auto md:p-6 pb-6">
      
      {/* Profile Header Parallax/Entrance */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-[#121212] md:rounded-3xl overflow-hidden border border-white/5 shadow-xl mb-6"
      >
        <div className="h-32 md:h-40 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] opacity-90" />
        <div className="px-6 pb-6 relative z-10">
          <div className="relative -mt-16 mb-4 flex items-end justify-between">
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
              className="w-28 h-28 rounded-full border-[6px] border-[#121212] bg-gradient-to-br from-[#1E1E24] to-[#2B2B36] flex items-center justify-center shadow-lg"
            >
              <User className="w-12 h-12 text-gray-400" />
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="outline"
                onClick={() => { setEditName(user?.name || ""); setShowProfileEdit(true); }}
                className="bg-white/5 border-white/10 hover:bg-white/10 text-white font-semibold rounded-lg mb-2 shadow-sm gap-2"
              >
                <Pencil className="w-4 h-4" />
                프로필 편집
              </Button>
            </motion.div>
          </div>
          <div>
            <h2 className="text-2xl font-black text-white mb-1 drop-shadow-sm">{user?.name || 'AI Creator'}</h2>
            <p className="text-sm font-medium text-[#6366f1] mb-6">{user?.email}</p>
          </div>
          
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-3 gap-3 md:gap-5"
          >
            {[
              { label: '총 판매', value: totalSales, color: 'text-[#6366f1]' },
              { label: '등록 상품', value: myProducts.length, color: 'text-[#8b5cf6]' },
              { label: '평점', value: '4.8', color: 'text-[#10b981]' },
            ].map((stat, idx) => (
              <motion.div 
                key={idx}
                variants={itemVariants} 
                whileHover={{ y: -5, scale: 1.02 }}
                className="bg-[#1c1c1e] p-4 rounded-2xl border border-white/5 text-center flex flex-col justify-center shadow-sm hover:border-white/10 transition-colors cursor-default"
              >
                <p className={`text-2xl md:text-3xl font-black mb-1 drop-shadow-sm ${stat.color}`}>{stat.value}</p>
                <p className="text-[11px] md:text-xs font-bold text-gray-500 uppercase tracking-wider">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Tabs Layout */}
      <div className="px-4 md:px-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-[#1c1c1e] p-1.5 rounded-2xl mb-8 border border-white/5 shadow-inner">
            {[
              { id: 'profile', icon: User, label: '프로필' },
              { id: 'purchases', icon: ShoppingBag, label: '구매' },
              { id: 'sales', icon: TrendingUp, label: '판매' },
              { id: 'settings', icon: Settings, label: '설정' },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <TabsTrigger 
                  key={tab.id}
                  value={tab.id}
                  className={`relative py-3 rounded-xl transition-all duration-300 font-bold text-[13px] md:text-sm
                    ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}
                  data-[state=active]:bg-transparent data-[state=active]:shadow-none`}
                >
                  <Icon className="w-4 h-4 mr-1.5 hidden md:block" />
                  <span className="relative z-10 flex items-center justify-center w-full">
                    {tab.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="mypage-active-tab"
                      className="absolute inset-0 bg-[#2d2d30] border border-white/10 rounded-xl shadow-md -z-0"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <TabsContent value="profile" className="space-y-4 m-0">
                <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <h3 className="text-lg font-bold text-white mb-5 flex items-center"><User className="w-5 h-5 mr-2 text-[#6366f1]" />계정 정보</h3>
                  <div className="space-y-4">
                    <div className="bg-[#1c1c1e] p-4 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between group hover:border-white/10 transition-colors">
                      <div>
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">이메일</p>
                        <p className="text-gray-200 font-medium">{user?.email}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 hidden md:block" />
                    </div>
                    <div className="bg-[#1c1c1e] p-4 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between group hover:border-white/10 transition-colors">
                      <div>
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">이름</p>
                        <p className="text-gray-200 font-medium">{user?.name}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 hidden md:block" />
                    </div>
                    <div className="bg-[#1c1c1e] p-4 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between group hover:border-white/10 transition-colors">
                      <div>
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">계정 유형</p>
                        <p className="inline-flex items-center gap-2 text-gray-200 font-medium">
                          판매자 인증 완료
                          <span className="px-2 py-0.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded text-[10px] font-black tracking-wider shadow-sm">
                            PRO
                          </span>
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 hidden md:block" />
                    </div>
                  </div>
                </div>

                <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <h3 className="text-lg font-bold text-white mb-5 flex items-center"><CreditCard className="w-5 h-5 mr-2 text-[#8b5cf6]" />정산 계좌</h3>
                  <div className="bg-[#1c1c1e] p-5 rounded-xl border border-white/5 flex items-center justify-between relative overflow-hidden group">
                    <div className="relative z-10">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">국민은행</p>
                      <p className="text-lg text-gray-200 font-medium tracking-wider">123-45-678910</p>
                    </div>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="relative z-10 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-bold border border-white/10 transition-colors shadow-sm">
                      변경
                    </motion.button>
                    <CreditCard className="absolute -right-4 -bottom-4 w-24 h-24 text-white/5 rotate-12 group-hover:text-white/10 transition-colors" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="purchases" className="space-y-4 m-0">
                <div className="bg-gradient-to-r from-[#1E1E24] to-[#121212] p-6 rounded-2xl border border-white/5 shadow-md mb-6 relative overflow-hidden">
                  <div className="relative z-10">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">총 구매 금액</p>
                    <p className="text-3xl font-black text-white drop-shadow-sm">₩{purchaseHistory.reduce((sum, p) => sum + p.price, 0).toLocaleString()}</p>
                  </div>
                  <ShoppingBag className="absolute right-4 top-1/2 -translate-y-1/2 w-20 h-20 text-[#6366f1]/20 rotate-[-15deg]" />
                </div>

                <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {purchaseHistory.map((purchase) => (
                    <motion.div key={purchase.id} variants={itemVariants} className="bg-[#121212] rounded-2xl border border-white/5 overflow-hidden flex hover:border-white/10 transition-colors group">
                      <div className="relative w-28 md:w-36 h-full flex-shrink-0 bg-black">
                        <img 
                          src={purchase.thumbnail} 
                          alt={purchase.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#121212]" />
                      </div>
                      <div className="p-4 flex flex-col flex-1 pb-4">
                        <h3 className="font-bold text-gray-200 mb-1 line-clamp-1">{purchase.title}</h3>
                        <p className="text-[10px] text-gray-500 font-medium mb-3">{purchase.date}</p>
                        
                        <div className="flex items-center justify-between mb-4">
                          <span className="px-2 py-0.5 bg-[#6366f1]/10 border border-[#6366f1]/20 text-[#6366f1] rounded text-[10px] font-bold">
                            {purchase.license}
                          </span>
                          <span className="font-bold text-gray-300">₩{purchase.price.toLocaleString()}</span>
                        </div>
                        
                        <div className="flex gap-2 mt-auto">
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-2 rounded-lg transition-colors border border-white/5">
                            다운로드
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {purchaseHistory.length === 0 && (
                    <div className="col-span-full py-10 text-center text-gray-500 font-medium bg-[#121212] rounded-2xl border border-white/5">
                      아직 구매한 내역이 없습니다.
                    </div>
                  )}
                </motion.div>
              </TabsContent>

              <TabsContent value="sales" className="space-y-4 m-0">
                <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-4">
                  <motion.div variants={itemVariants} className="bg-[#121212] p-5 rounded-2xl border border-white/5 relative overflow-hidden group">
                    <div className="relative z-10">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">총 매출</p>
                      <p className="text-2xl font-black text-white">₩{totalRevenue.toLocaleString()}</p>
                    </div>
                    <DollarSign className="absolute right-2 bottom-2 w-16 h-16 text-[#6366f1]/10 group-hover:scale-110 transition-transform duration-500" />
                  </motion.div>
                  <motion.div variants={itemVariants} className="bg-[#121212] p-5 rounded-2xl border border-white/5 relative overflow-hidden group">
                    <div className="relative z-10">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">실 정산액</p>
                      <p className="text-2xl font-black text-[#8b5cf6]">₩{expectedPayout.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-500 font-medium mt-1">수수료 15% 공제</p>
                    </div>
                    <TrendingUp className="absolute right-2 bottom-2 w-16 h-16 text-[#8b5cf6]/10 group-hover:scale-110 transition-transform duration-500" />
                  </motion.div>
                </motion.div>

                {/* Payout Schedule */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-gradient-to-r from-[#6366f1]/10 to-[#8b5cf6]/10 p-5 rounded-2xl border border-[#6366f1]/20 shadow-inner">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#6366f1]/20 flex items-center justify-center shrink-0">
                      <CreditCard className="w-5 h-5 text-[#6366f1]" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white mb-1">다음 정산 예정</h4>
                      <p className="text-[13px] text-gray-300 font-medium mb-1">
                        {(() => {
                          const now = new Date();
                          const nextPayout = new Date(now.getFullYear(), now.getDate() <= 15 ? now.getMonth() : now.getMonth() + 1, 15);
                          return `${nextPayout.getFullYear()}년 ${nextPayout.getMonth() + 1}월 ${nextPayout.getDate()}일`;
                        })()} • <span className="font-bold text-[#8b5cf6]">₩{expectedPayout.toLocaleString()}</span>
                      </p>
                      <p className="text-[11px] text-gray-500">매월 15일에 전월 매출이 자동 정산됩니다</p>
                    </div>
                  </div>
                </motion.div>

                {/* Sales Chart */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <h3 className="font-bold text-white mb-6">월별 매출 추이</h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlySales} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                        <XAxis dataKey="month" stroke="#666" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 500 }} dy={10} />
                        <YAxis stroke="#666" axisLine={false} tickLine={false} tickFormatter={(val) => `₩${val/10000}만`} tick={{ fontSize: 12, fontWeight: 500 }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1a1a1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', color: '#fff' }}
                          itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                          formatter={(value: number) => [`₩${value.toLocaleString()}`, '매출']}
                          cursor={{ stroke: '#333', strokeWidth: 2 }}
                        />
                        <Line type="monotone" dataKey="sales" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#121212' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>

                {/* Product List */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <h3 className="font-bold text-white mb-5 flex items-center justify-between">
                    등록 상품
                    <span className="px-2.5 py-1 bg-white/5 text-gray-400 rounded-md text-[11px]">{myProducts.length}개</span>
                  </h3>
                  <div className="space-y-4">
                    {myProducts.map((product) => (
                      <div key={product.id} className="flex gap-4 pb-4 border-b border-white/5 last:border-0 last:pb-0 group">
                        <div className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-black">
                          <img 
                            src={product.thumbnail} 
                            alt={product.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        </div>
                        <div className="flex-1 flex flex-col justify-center">
                          <h4 className="font-bold text-gray-200 mb-2 line-clamp-1">{product.title}</h4>
                          <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-500 mb-2 bg-[#1c1c1e] p-2 rounded-lg border border-white/5">
                            <div className="text-center">
                              <p className="mb-0.5">조회수</p>
                              <p className="text-white font-bold">{product.views.toLocaleString()}</p>
                            </div>
                            <div className="text-center border-x border-white/5">
                              <p className="mb-0.5">판매</p>
                              <p className="text-white font-bold">{product.sales}건</p>
                            </div>
                            <div className="text-center">
                              <p className="mb-0.5">매출</p>
                              <p className="text-[#8b5cf6] font-bold">₩{product.revenue.toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="flex">
                            <span className="px-2 py-0.5 bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981] rounded text-[10px] font-bold shadow-sm">
                              {product.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {myProducts.length === 0 && (
                       <div className="py-8 text-center text-gray-500 font-medium">
                         등록한 비디오가 없습니다.
                       </div>
                    )}
                  </div>
                </motion.div>
              </TabsContent>

              <TabsContent value="settings" className="space-y-4 m-0">
                <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <h3 className="font-bold text-white mb-5 flex items-center"><Bell className="w-5 h-5 mr-2 text-gray-400" />알림 설정</h3>
                  <div className="space-y-4">
                    {[
                      { label: "새로운 판매 알림", checked: true },
                      { label: "댓글 알림", checked: true },
                      { label: "좋아요 알림", checked: false },
                      { label: "마케팅 정보 수신", checked: false }
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-[#1c1c1e] rounded-xl border border-white/5">
                        <span className="font-medium text-gray-300 text-sm">{item.label}</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" defaultChecked={item.checked} className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#6366f1] peer-checked:to-[#8b5cf6] shadow-sm"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <h3 className="font-bold text-white mb-5">계정 보안</h3>
                  <div className="space-y-3">
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                      <Button
                        variant="outline"
                        onClick={() => { setPwNew(""); setPwConfirm(""); setShowPasswordChange(true); }}
                        className="w-full justify-between bg-[#1c1c1e] text-gray-300 border-white/5 hover:bg-white/5 hover:text-white font-medium rounded-xl h-12 shadow-sm"
                      >
                        <span className="flex items-center gap-2"><Lock className="w-4 h-4" />비밀번호 변경</span>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                      <Button
                        variant="outline"
                        onClick={() => toast.info("2단계 인증은 준비 중입니다.")}
                        className="w-full justify-between bg-[#1c1c1e] text-gray-300 border-white/5 hover:bg-white/5 hover:text-white font-medium rounded-xl h-12 shadow-sm"
                      >
                        <span>2단계 인증 설정</span>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </motion.div>
                  </div>
                </div>

                <div className="pt-4">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button 
                      variant="destructive" 
                      className="w-full gap-2 h-14 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-xl font-bold transition-all shadow-sm" 
                      onClick={() => {
                        signOut();
                        toast.success("로그아웃 되었습니다.");
                      }}
                    >
                      <LogOut className="w-5 h-5" />
                      로그아웃
                    </Button>
                  </motion.div>
                </div>
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </div>
    </div>

      {/* 프로필 편집 모달 */}
      <AnimatePresence>
        {showProfileEdit && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowProfileEdit(false)}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring" as const, stiffness: 300, damping: 30 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-[#1a1a1c] rounded-2xl border border-white/10 p-5 max-w-sm mx-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Pencil className="w-5 h-5 text-[#8b5cf6]" />프로필 편집</h3>
                <button onClick={() => setShowProfileEdit(false)} className="p-1.5 hover:bg-white/10 rounded-full text-gray-400"><X className="w-5 h-5" /></button>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">이메일</label>
                <p className="px-4 py-3 bg-white/5 rounded-xl text-sm text-gray-500 border border-white/5">{user?.email}</p>
              </div>
              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">표시 이름</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  maxLength={30}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors"
                  placeholder="이름을 입력하세요"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowProfileEdit(false)} className="flex-1 border-white/10">취소</Button>
                <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile || !editName.trim()}
                  className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
                  {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : "저장"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 비밀번호 변경 모달 */}
      <AnimatePresence>
        {showPasswordChange && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowPasswordChange(false)}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring" as const, stiffness: 300, damping: 30 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-[#1a1a1c] rounded-2xl border border-white/10 p-5 max-w-sm mx-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Lock className="w-5 h-5 text-[#8b5cf6]" />비밀번호 변경</h3>
                <button onClick={() => setShowPasswordChange(false)} className="p-1.5 hover:bg-white/10 rounded-full text-gray-400"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3 mb-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">새 비밀번호</label>
                  <div className="relative">
                    <input type={showPwNew ? "text" : "password"} value={pwNew} onChange={e => setPwNew(e.target.value)}
                      placeholder="6자 이상"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors" />
                    <button onClick={() => setShowPwNew(!showPwNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {showPwNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">새 비밀번호 확인</label>
                  <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)}
                    placeholder="비밀번호 재입력"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors" />
                </div>
              </div>
              <p className="text-xs text-gray-600 mb-4">* 소셜 로그인 계정은 비밀번호 변경이 제한될 수 있습니다.</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowPasswordChange(false)} className="flex-1 border-white/10">취소</Button>
                <Button size="sm" onClick={handleChangePassword} disabled={savingPassword || !pwNew || !pwConfirm}
                  className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
                  {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "변경"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
  </div>
  );
}