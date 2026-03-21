import { useState, useEffect, useMemo } from "react";
import { User, ShoppingBag, CreditCard, Settings, LogOut, TrendingUp, DollarSign, Package, BarChart3, LogIn, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
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

export function MyPage({ onSignInClick }: MyPageProps) {
  const [activeTab, setActiveTab] = useState("profile");
  const { user, signOut, isAuthenticated } = useAuth();
  const [purchaseHistory, setPurchaseHistory] = useState<Purchase[]>([]);
  const [myProducts, setMyProducts] = useState<MyProduct[]>([]);
  const [monthlySales, setMonthlySales] = useState<{month: string, sales: number}[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMyData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. 구매 내역 가져오기
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

      // 2. 내 상품 및 판매 정보 가져오기
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

        // 월별 매출 집계
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
        })).sort((a, b) => {
          const m1 = parseInt(a.month);
          const m2 = parseInt(b.month);
          return m1 - m2;
        });

        // 데이터가 없으면 빈 배열이라도 6개월치 기틀을 만듭니다
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
  const platformFee = totalRevenue * 0.15; // 15% fee
  const expectedPayout = totalRevenue - platformFee;

  // 로그인하지 않은 경우 안내 화면
  if (!isAuthenticated) {
    return (
      <div className="h-full flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md mx-auto">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] mx-auto mb-6 flex items-center justify-center">
            <User className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl mb-3">로그인이 필요합니다</h2>
          <p className="text-muted-foreground mb-6">
            마이페이지를 이용하려면 먼저 로그인해주세요.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            데스크톱에서는 우측 상단의 로그인 버튼을 클릭하세요.
          </p>
          <Button 
            onClick={onSignInClick}
            className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] py-6 text-lg"
          >
            로그인 / 회원가입
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#6366f1] mx-auto mb-4" />
          <p className="text-muted-foreground">정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto p-4 md:p-6">
      {/* Profile Header */}
      <div className="relative">
        <div className="h-32 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" />
        <div className="px-6 pb-6">
          <div className="relative -mt-16 mb-4">
            <div className="w-24 h-24 rounded-full border-4 border-background bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
              <User className="w-12 h-12 text-white" />
            </div>
          </div>
          <h2 className="text-xl mb-1">{user?.name || 'AI Creator'}</h2>
          <p className="text-sm text-muted-foreground mb-4">{user?.email}</p>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-card p-3 rounded-lg border border-border text-center">
              <p className="text-2xl font-medium text-[#6366f1]">{totalSales}</p>
              <p className="text-xs text-muted-foreground">총 판매</p>
            </div>
            <div className="bg-card p-3 rounded-lg border border-border text-center">
              <p className="text-2xl font-medium text-[#8b5cf6]">{myProducts.length}</p>
              <p className="text-xs text-muted-foreground">등록 상품</p>
            </div>
            <div className="bg-card p-3 rounded-lg border border-border text-center">
              <p className="text-2xl font-medium text-[#3b82f6]">4.8</p>
              <p className="text-xs text-muted-foreground">평점</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 px-6 pb-20">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-card mb-6">
            <TabsTrigger value="profile">
              <User className="w-4 h-4 mr-2" />
              프로필
            </TabsTrigger>
            <TabsTrigger value="purchases">
              <ShoppingBag className="w-4 h-4 mr-2" />
              구매
            </TabsTrigger>
            <TabsTrigger value="sales">
              <TrendingUp className="w-4 h-4 mr-2" />
              판매
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="w-4 h-4 mr-2" />
              설정
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <div className="bg-card p-4 rounded-lg border border-border">
              <h3 className="mb-4">계정 정보</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">이메일</p>
                  <p>{user?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">이름</p>
                  <p>{user?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">가입일</p>
                  <p>{user?.created_at ? new Date(user.created_at).toLocaleDateString('ko-KR') : '최근'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">계정 유형</p>
                  <p className="inline-flex items-center gap-2">
                    판매자 인증 완료
                    <span className="px-2 py-1 bg-[#6366f1]/20 text-[#6366f1] rounded text-xs">
                      PRO
                    </span>
                  </p>
                </div>
              </div>
              <Button variant="outline" className="w-full mt-4">
                프로필 수정
              </Button>
            </div>

            <div className="bg-card p-4 rounded-lg border border-border">
              <h3 className="mb-4">정산 계좌</h3>
              <div className="space-y-2 mb-4">
                <p className="text-sm text-muted-foreground">은행</p>
                <p>국민은행</p>
                <p className="text-sm text-muted-foreground mt-2">계좌번호</p>
                <p>123-45-678910</p>
              </div>
              <Button variant="outline" className="w-full">
                계좌 변경
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="purchases" className="space-y-4">
            <div className="bg-card p-4 rounded-lg border border-border mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">총 구매 금액</p>
                  <p className="text-2xl font-medium">₩{purchaseHistory.reduce((sum, p) => sum + p.price, 0).toLocaleString()}</p>
                </div>
                <ShoppingBag className="w-8 h-8 text-[#6366f1]" />
              </div>
            </div>

            {purchaseHistory.map((purchase) => (
              <div key={purchase.id} className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="flex gap-4 p-4">
                  <img 
                    src={purchase.thumbnail} 
                    alt={purchase.title}
                    className="w-24 h-36 object-cover rounded"
                  />
                  <div className="flex-1">
                    <h3 className="mb-2">{purchase.title}</h3>
                    <div className="space-y-1 text-sm text-muted-foreground mb-3">
                      <p>라이선스: {purchase.license}</p>
                      <p>구매일: {purchase.date}</p>
                      <p className="text-[#6366f1]">₩{purchase.price.toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
                        다시 다운로드
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1">
                        영수증
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="sales" className="space-y-4">
            {/* Revenue Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card p-4 rounded-lg border border-border">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">총 매출</p>
                  <DollarSign className="w-5 h-5 text-[#6366f1]" />
                </div>
                <p className="text-2xl font-medium">₩{totalRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-card p-4 rounded-lg border border-border">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">실 정산액</p>
                  <TrendingUp className="w-5 h-5 text-[#8b5cf6]" />
                </div>
                <p className="text-2xl font-medium">₩{expectedPayout.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">수수료 15% 공제</p>
              </div>
            </div>

            {/* Sales Chart */}
            <div className="bg-card p-4 rounded-lg border border-border">
              <h3 className="mb-4">월별 매출 추이</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthlySales}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                  <XAxis dataKey="month" stroke="#a0a0a0" />
                  <YAxis stroke="#a0a0a0" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                    formatter={(value: number) => [`₩${value.toLocaleString()}`, '매출']}
                  />
                  <Line type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Product List */}
            <div className="bg-card p-4 rounded-lg border border-border">
              <h3 className="mb-4">등록 상품</h3>
              <div className="space-y-4">
                {myProducts.map((product) => (
                  <div key={product.id} className="flex gap-4 pb-4 border-b border-border last:border-0 last:pb-0">
                    <img 
                      src={product.thumbnail} 
                      alt={product.title}
                      className="w-20 h-28 object-cover rounded"
                    />
                    <div className="flex-1">
                      <h4 className="mb-2">{product.title}</h4>
                      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mb-2">
                        <div>
                          <p>조회수</p>
                          <p className="text-foreground font-medium">{product.views.toLocaleString()}</p>
                        </div>
                        <div>
                          <p>판매</p>
                          <p className="text-foreground font-medium">{product.sales}건</p>
                        </div>
                        <div>
                          <p>매출</p>
                          <p className="text-foreground font-medium">₩{product.revenue.toLocaleString()}</p>
                        </div>
                      </div>
                      <span className="px-2 py-1 bg-[#10b981]/20 text-[#10b981] rounded text-xs">
                        {product.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payout Schedule */}
            <div className="bg-gradient-to-r from-[#6366f1]/10 to-[#8b5cf6]/10 p-4 rounded-lg border border-[#6366f1]/30">
              <div className="flex items-start gap-3">
                <CreditCard className="w-5 h-5 text-[#6366f1] mt-0.5" />
                <div>
                  <h4 className="mb-1">다음 정산 예정</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    2026년 3월 15일 • ₩{expectedPayout.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    매월 15일에 전월 매출이 자동 정산됩니다
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <div className="bg-card p-4 rounded-lg border border-border">
              <h3 className="mb-4">알림 설정</h3>
              <div className="space-y-3">
                {[
                  { label: "새로운 판매 알림", checked: true },
                  { label: "댓글 알림", checked: true },
                  { label: "좋아요 알림", checked: false },
                  { label: "마케팅 정보 수신", checked: false }
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span>{item.label}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked={item.checked} className="sr-only peer" />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#6366f1] peer-checked:to-[#8b5cf6]"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card p-4 rounded-lg border border-border">
              <h3 className="mb-4">개인정보 보호</h3>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  비밀번호 변경
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  2단계 인증 설정
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  개인정보 다운로드
                </Button>
              </div>
            </div>

            <div className="bg-card p-4 rounded-lg border border-border">
              <h3 className="mb-4">고객 지원</h3>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  FAQ
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  1:1 문의
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  이용약관
                </Button>
              </div>
            </div>

            <Button variant="destructive" className="w-full gap-2" onClick={() => {
              signOut();
              toast.success("로그아웃 되었습니다.");
            }}>
              <LogOut className="w-4 h-4" />
              로그아웃
            </Button>
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </div>
  );
}