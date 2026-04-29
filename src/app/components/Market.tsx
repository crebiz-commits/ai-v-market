import { useState, useMemo, useEffect, useRef } from "react";
import { Search, SlidersHorizontal, Loader2, Eye, ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Slider } from "./ui/slider";
import { CoverFlow } from "./CoverFlow";
import { supabase } from "../utils/supabaseClient";
import { useBackButton } from "../hooks/useBackButton";

interface Product {
  id: string;
  thumbnail: string;
  title: string;
  creator: string;
  price: number;
  duration: string;
  resolution: string;
  tool: string;
  category: string;
  videoUrl: string;
  highlightStart?: number;
  highlightEnd?: number;
}

const aiTools = ["전체", "Sora", "Runway Gen-3", "Pika Labs", "Luma Dream Machine"];
const categories = ["전체", "AI영화", "AI드라마", "AI애니메이션", "AI다큐멘터리", "AI뮤직비디오", "SF", "액션", "로맨스", "공포", "판타지", "드라마", "코미디", "자연/풍경", "추상", "기타"];
const resolutions = ["전체", "1080p", "4K", "8K"];
const genres = ["전체", "SF", "액션", "로맨스", "공포", "판타지", "드라마", "코미디", "자연/풍경", "추상", "기타"];

interface MarketProps {
  onProductClick: (product: Product) => void;
}

export function Market({ onProductClick }: MarketProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [sortBy, setSortBy] = useState("latest");
  const [priceRange, setPriceRange] = useState([0, 200000]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedResolutions, setSelectedResolutions] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // 큐레이션 → 그리드 뷰 강제 전환 플래그 (인기/신작 "더보기"용)
  const [forceGrid, setForceGrid] = useState(false);

  // 뒤로가기로 필터 패널 닫기
  useBackButton(isFilterOpen, () => setIsFilterOpen(false));

  // Supabase에서 상품 데이터 가져오기
  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("videos")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(24);

        if (error) throw error;

        if (data) {
          const mappedProducts: Product[] = data.map((item: any) => ({
            id: item.id,
            thumbnail: item.thumbnail,
            title: item.title,
            creator: item.creator || "AI Creator",
            price: item.price_standard || 0,
            duration: item.duration || "0:15",
            resolution: item.resolution || "1080p",
            tool: item.ai_tool || "AI Tool",
            category: item.category || "General",
            videoUrl: item.video_url || "",
            highlightStart: item.highlight_start || 0,
            highlightEnd: item.highlight_end || (item.highlight_start || 0) + 15,
          }));
          setProducts(mappedProducts);
        }
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    let filtered = products.filter(product => {
      const matchesSearch = product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           product.creator.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = (selectedCategory === "전체" || selectedCategory === "인기급상승") 
        ? true 
        : product.category === selectedCategory;
      const matchesPrice = product.price >= priceRange[0] && product.price <= priceRange[1];
      const matchesTool = selectedTools.length === 0 || selectedTools.includes(product.tool);
      const matchesResolution = selectedResolutions.length === 0 || selectedResolutions.includes(product.resolution);
      
      return matchesSearch && matchesCategory && matchesPrice && matchesTool && matchesResolution;
    });

    const effectiveSortBy = selectedCategory === "인기급상승" ? "popular" : sortBy;

    switch (effectiveSortBy) {
      case "latest":
        break;
      case "popular":
        // 인기순: 가격이 높을수록 인기 많은 콘텐츠로 간주 (likes 필드 없을 때 대체)
        filtered = [...filtered].sort((a, b) => b.price - a.price);
        break;
      case "price-low":
        filtered = [...filtered].sort((a, b) => a.price - b.price);
        break;
      case "price-high":
        filtered = [...filtered].sort((a, b) => b.price - a.price);
        break;
      default:
        break;
    }

    return filtered;
  }, [products, searchQuery, selectedCategory, priceRange, selectedTools, selectedResolutions, selectedGenres, sortBy]);

  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 400;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const coverFlowVideos = useMemo(() => {
    return products.slice(0, 10).map((product) => ({
      id: product.id,
      thumbnail: product.thumbnail,
      title: product.title,
      creator: product.creator,
      videoUrl: product.videoUrl,
      duration: product.duration,
      resolution: product.resolution,
      tool: product.tool,
      price: product.price,
      highlightStart: product.highlightStart,
      highlightEnd: product.highlightEnd,
    }));
  }, [products]);

  // 검색/필터 활성 여부 (활성 시 그리드, 비활성 시 큐레이션)
  const hasActiveFilter = useMemo(() => {
    return (
      forceGrid ||
      searchQuery !== "" ||
      selectedCategory !== "전체" ||
      priceRange[0] !== 0 ||
      priceRange[1] !== 200000 ||
      selectedTools.length > 0 ||
      selectedResolutions.length > 0
    );
  }, [forceGrid, searchQuery, selectedCategory, priceRange, selectedTools, selectedResolutions]);

  // "큐레이션으로 돌아가기" — 모든 필터 초기화
  const resetToCuration = () => {
    setForceGrid(false);
    setSearchQuery("");
    setSelectedCategory("전체");
    setPriceRange([0, 200000]);
    setSelectedTools([]);
    setSelectedResolutions([]);
    setSelectedGenres([]);
    setSortBy("latest");
  };

  // 큐레이션 섹션 (필터 비활성 시 노출) — 활성 시에는 빈 배열로 계산 비용 절감
  const curationSections = useMemo(() => {
    if (hasActiveFilter || products.length === 0) return [];
    type Section = {
      id: string;
      title: string;
      subtitle: string;
      videos: Product[];
      onShowAll?: () => void;
    };
    const sections: Section[] = [];

    // 1. 인기급상승 — 가격 기준 (프록시)
    const popular = [...products].sort((a, b) => b.price - a.price).slice(0, 10);
    if (popular.length > 0) sections.push({
      id: "popular",
      title: "🔥 인기급상승",
      subtitle: "지금 가장 사랑받는 영상",
      videos: popular,
      onShowAll: () => { setSortBy("popular"); setForceGrid(true); },
    });

    // 2. 에디터 추천 — 큐레이션만 (더보기 없음)
    const editorPicks = [...products].slice(0, 10);
    if (editorPicks.length > 0) sections.push({
      id: "editor",
      title: "🎬 에디터 추천",
      subtitle: "큐레이터가 직접 선정한 프리미엄 영상",
      videos: editorPicks,
    });

    // 3. 신작
    const newest = products.slice(0, 10);
    if (newest.length > 0) sections.push({
      id: "new",
      title: "✨ 신작",
      subtitle: "방금 도착한 따끈따끈한 신작",
      videos: newest,
      onShowAll: () => { setSortBy("latest"); setForceGrid(true); },
    });

    // 4. 시네마틱 컬렉션
    const cinematic = products.filter(p =>
      ["AI영화", "AI드라마", "AI애니메이션", "AI다큐멘터리"].includes(p.category)
    ).slice(0, 10);
    if (cinematic.length > 0) sections.push({
      id: "cinematic",
      title: "🎭 시네마틱 컬렉션",
      subtitle: "영화 같은 비주얼, 깊이 있는 스토리텔링",
      videos: cinematic,
      onShowAll: () => setSelectedCategory("AI영화"),
    });

    // 5. SF/판타지
    const scifi = products.filter(p => ["SF", "판타지", "공포"].includes(p.category)).slice(0, 10);
    if (scifi.length > 0) sections.push({
      id: "scifi",
      title: "🚀 SF · 판타지",
      subtitle: "현실을 벗어난 상상력",
      videos: scifi,
      onShowAll: () => setSelectedCategory("SF"),
    });

    // 6. AI 툴별 — Sora
    const sora = products.filter(p => p.tool === "Sora").slice(0, 10);
    if (sora.length > 0) sections.push({
      id: "sora",
      title: "🤖 Sora 베스트",
      subtitle: "OpenAI Sora로 제작된 인기 영상",
      videos: sora,
      onShowAll: () => setSelectedTools(["Sora"]),
    });

    // 7. 4K 고화질
    const hires = products.filter(p => p.resolution === "4K" || p.resolution === "8K").slice(0, 10);
    if (hires.length > 0) sections.push({
      id: "hires",
      title: "💎 4K · 8K 고화질",
      subtitle: "선명한 화질로 즐기는 프리미엄 영상",
      videos: hires,
      onShowAll: () => setSelectedResolutions(["4K", "8K"]),
    });

    return sections;
  }, [products, hasActiveFilter]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
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
          <p className="text-muted-foreground font-medium">상품을 불러오는 중...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden selection:bg-[#6366f1]/30">
      {/* Search Header */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex-shrink-0 p-4 md:px-6 md:py-6 border-b border-border/50 bg-card/30 backdrop-blur-md"
      >
        <div className="md:max-w-7xl md:mx-auto">
          <div className="relative mb-5 group">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5 group-focus-within:text-[#6366f1] transition-colors" />
            <Input
              type="text"
              placeholder="AI 영상 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 bg-white/5 border-white/10 hover:border-white/20 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] transition-all rounded-xl shadow-inner"
            />
          </div>

          {/* Category Tabs with Netflix-style Scroll Buttons */}
          <div className="relative group/categories px-1">
            {/* Left Scroll Sidebar (Netflix Style) */}
            <div 
              className="absolute left-0 top-0 bottom-1 z-20 w-12 bg-gradient-to-r from-background via-background/80 to-transparent flex items-center justify-start pl-0.5 opacity-0 group-hover/categories:opacity-100 transition-all duration-300 pointer-events-none"
            >
              <button
                onClick={() => scroll('left')}
                className="w-8 h-full flex items-center justify-center text-white hover:scale-125 transition-transform pointer-events-auto drop-shadow-lg"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            </div>

            {/* Category Scroll Container */}
            <div 
              ref={scrollRef}
              className="flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-hide scroll-smooth"
            >
              {categories.map((category) => {
                const isActive = selectedCategory === category;
                return (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`relative px-4 py-1.5 rounded-full whitespace-nowrap transition-colors flex-shrink-0 text-xs font-semibold select-none
                      ${isActive ? 'text-white' : 'text-muted-foreground hover:text-white hover:bg-white/5 bg-white/5 border border-white/5'}
                    `}
                  >
                    {isActive && (
                      <motion.div 
                        layoutId="activeCategory"
                        className="absolute inset-0 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)] -z-10"
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                    {category}
                  </button>
                )
              })}
            </div>

            {/* Right Scroll Sidebar (Netflix Style) */}
            <div 
              className="absolute right-0 top-0 bottom-1 z-20 w-12 bg-gradient-to-l from-background via-background/80 to-transparent flex items-center justify-end pr-0.5 opacity-0 group-hover/categories:opacity-100 transition-all duration-300 pointer-events-none"
            >
              <button
                onClick={() => scroll('right')}
                className="w-8 h-full flex items-center justify-center text-white hover:scale-125 transition-transform pointer-events-auto drop-shadow-lg"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filter & Sort Bar */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex-shrink-0 flex items-center justify-between p-4 md:px-6 border-b border-border/50 bg-background/50 backdrop-blur-sm"
      >
        <div className="md:max-w-7xl md:mx-auto md:w-full flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <SheetTrigger asChild>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="outline" size="sm" className="gap-2 border-white/10 bg-white/5 hover:bg-white/10 hover:text-white transition-all rounded-lg font-medium shadow-sm">
                    <SlidersHorizontal className="w-4 h-4" />
                    상세 필터
                  </Button>
                </motion.div>
              </SheetTrigger>
              <SheetContent side="left" className="bg-[#121212] px-6 border-r border-white/10">
                <SheetHeader className="mb-6">
                  <SheetTitle className="text-white text-xl">상세 필터</SheetTitle>
                  <SheetDescription className="text-gray-400">원하는 조건으로 영상을 정교하게 찾아보세요</SheetDescription>
                </SheetHeader>
                
                <div className="space-y-8">
                  {/* Price Range */}
                  <div className="px-1">
                    <Label className="mb-4 block text-gray-200 font-semibold">가격 범위</Label>
                    <Slider
                      min={0}
                      max={200000}
                      step={10000}
                      value={priceRange}
                      onValueChange={setPriceRange}
                      className="mb-3"
                    />
                    <div className="flex justify-between text-sm text-[#8b5cf6] font-medium">
                      <span>₩{priceRange[0].toLocaleString()}</span>
                      <span>₩{priceRange[1].toLocaleString()}</span>
                    </div>
                  </div>

                  {/* AI Tools */}
                  <div className="px-1">
                    <Label className="mb-4 block text-gray-200 font-semibold">AI 툴</Label>
                    {aiTools.filter(t => t !== "전체").map((tool) => (
                      <div key={tool} className="flex items-center space-x-3 mb-3">
                        <Checkbox
                          id={tool}
                          checked={selectedTools.includes(tool)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedTools([...selectedTools, tool]);
                            } else {
                              setSelectedTools(selectedTools.filter(t => t !== tool));
                            }
                          }}
                          className="border-white/20 data-[state=checked]:bg-[#6366f1] data-[state=checked]:border-[#6366f1]"
                        />
                        <label
                          htmlFor={tool}
                          className="text-sm font-medium text-gray-300 leading-none cursor-pointer hover:text-white transition-colors"
                        >
                          {tool}
                        </label>
                      </div>
                    ))}
                  </div>

                  {/* Resolution */}
                  <div className="px-1">
                    <Label className="mb-4 block text-gray-200 font-semibold">해상도</Label>
                    {resolutions.filter(r => r !== "전체").map((resolution) => (
                      <div key={resolution} className="flex items-center space-x-3 mb-3">
                        <Checkbox
                          id={resolution}
                          checked={selectedResolutions.includes(resolution)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedResolutions([...selectedResolutions, resolution]);
                            } else {
                              setSelectedResolutions(selectedResolutions.filter(r => r !== resolution));
                            }
                          }}
                          className="border-white/20 data-[state=checked]:bg-[#6366f1] data-[state=checked]:border-[#6366f1]"
                        />
                        <label
                          htmlFor={resolution}
                          className="text-sm font-medium text-gray-300 leading-none cursor-pointer hover:text-white transition-colors"
                        >
                          {resolution}
                        </label>
                      </div>
                    ))}
                  </div>

                  {/* Genre */}
                  <div className="px-1">
                    <Label className="mb-4 block text-gray-200 font-semibold">장르</Label>
                    {genres.filter(g => g !== "전체").map((genre) => (
                      <div key={genre} className="flex items-center space-x-3 mb-3">
                        <Checkbox
                          id={genre}
                          checked={selectedGenres.includes(genre)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedGenres([...selectedGenres, genre]);
                            } else {
                              setSelectedGenres(selectedGenres.filter(g => g !== genre));
                            }
                          }}
                          className="border-white/20 data-[state=checked]:bg-[#6366f1] data-[state=checked]:border-[#6366f1]"
                        />
                        <label
                          htmlFor={genre}
                          className="text-sm font-medium text-gray-300 leading-none cursor-pointer hover:text-white transition-colors"
                        >
                          {genre}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <motion.div 
              initial={{ opacity: 0, x: -10 }} 
              animate={{ opacity: 1, x: 0 }} 
              className="px-3 py-1 bg-[#6366f1]/10 text-[#8b5cf6] rounded-full text-xs font-bold border border-[#6366f1]/20 shadow-sm"
            >
              {filteredProducts.length}건 검색됨
            </motion.div>
          </div>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[130px] bg-white/5 border-white/10 hover:border-white/20 transition-colors rounded-lg font-medium focus:ring-[#6366f1]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1c1c1e] border-white/10">
              <SelectItem value="latest" className="focus:bg-white/10 focus:text-white cursor-pointer">최신순</SelectItem>
              <SelectItem value="popular" className="focus:bg-white/10 focus:text-white cursor-pointer">인기순</SelectItem>
              <SelectItem value="price-low" className="focus:bg-white/10 focus:text-white cursor-pointer">낮은 가격순</SelectItem>
              <SelectItem value="price-high" className="focus:bg-white/10 focus:text-white cursor-pointer">높은 가격순</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-20">
        {/* Featured Carousel Section */}
        {coverFlowVideos.length > 0 && (
          <div className="flex-shrink-0 bg-gradient-to-b from-background via-card/5 to-transparent pt-4 pb-8 mb-4 border-b border-white/5">
            <CoverFlow videos={coverFlowVideos} hideControls={isFilterOpen} />
          </div>
        )}

        {/* 큐레이션 ↔ 그리드 전환 (트랜지션 적용) */}
        <AnimatePresence mode="wait" initial={false}>
        {!hasActiveFilter && curationSections.length > 0 && (
          <motion.div
            key="curation"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="pt-2 pb-20 md:max-w-7xl md:mx-auto"
          >
            {curationSections.map((section) => (
              <CurationRow key={section.id} section={section} onProductClick={onProductClick} />
            ))}
          </motion.div>
        )}

        {/* 검색 결과 그리드 (필터 활성 시) */}
        {hasActiveFilter && (
        <motion.div
          key="grid"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="p-4 md:px-6 pb-20"
        >
          {/* 큐레이션으로 돌아가기 */}
          <button
            onClick={resetToCuration}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#a78bfa] hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> 큐레이션으로 돌아가기
          </button>
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 md:max-w-7xl md:mx-auto"
          >
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ 
                    duration: 0.5, 
                    delay: (index % 10) * 0.05,
                    type: "spring",
                    stiffness: 300,
                    damping: 25
                  }}
                  whileHover={{ y: -8, scale: 1.02 }}
                  onClick={() => onProductClick(product)}
                  className="group relative flex flex-col bg-[#1a1a1c] border border-white/10 hover:border-[#6366f1]/50 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-[0_15px_35px_-10px_rgba(99,102,241,0.5)]"
                >
                  {/* Image Container — 16:9 시네마 비율 */}
                  <div className="relative aspect-video overflow-hidden bg-black">
                    <motion.img
                      src={product.thumbnail}
                      alt={product.title}
                      className="w-full h-full object-cover"
                      whileHover={{ scale: 1.08 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                    
                    {/* Glassmorphism Badges */}
                    <div className="absolute top-3 left-3 flex flex-col gap-2">
                      <div className="px-2.5 py-1 bg-black/50 backdrop-blur-md border border-white/20 rounded-lg text-white text-[10px] font-bold tracking-wider uppercase shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                        {product.tool}
                      </div>
                    </div>

                    <div className="absolute top-3 right-3">
                      <div className="px-2 py-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] backdrop-blur-md rounded-lg text-white text-[10px] font-bold shadow-lg">
                        {product.duration}
                      </div>
                    </div>

                    {/* Quick Preview Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
                      <div className="flex justify-center gap-3 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 drop-shadow-xl">
                        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-lg border border-white/30 flex items-center justify-center text-white hover:bg-[#6366f1] hover:border-[#6366f1] transition-colors shadow-lg">
                          <Eye className="w-5 h-5" />
                        </motion.div>
                        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-lg border border-white/30 flex items-center justify-center text-white hover:bg-[#8b5cf6] hover:border-[#8b5cf6] transition-colors shadow-lg">
                          <ShoppingCart className="w-5 h-5" />
                        </motion.div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Info Section */}
                  <div className="p-4 flex flex-col flex-1 relative z-10 bg-gradient-to-b from-transparent to-[#121212]">
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-100 text-[15px] mb-1.5 leading-tight line-clamp-1 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:to-purple-400 transition-all">
                        {product.title}
                      </h3>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-[#6366f1] to-[#8b5cf6] drop-shadow-sm flex items-center justify-center">
                          <span className="text-[8px] font-bold text-white">AI</span>
                        </div>
                        <span className="text-xs text-gray-400 font-medium">{product.creator}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-3 border-t border-white/10 mt-auto">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Price</span>
                        <span className="text-lg font-extrabold text-white">
                          ₩{product.price.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Res</span>
                        <span className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">{product.resolution}</span>
                      </div>
                    </div>
                  </div>

                  {/* Top Shine Effect */}
                  <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-300" />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          {filteredProducts.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20"
            >
              <div className="inline-flex w-16 h-16 rounded-full bg-[#1c1c1e] items-center justify-center mb-4 border border-white/10 shadow-inner">
                <Search className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">검색 결과가 없습니다</h3>
              <p className="text-gray-400">다른 키워드나 필터 조건으로 다시 시도해 보세요.</p>
            </motion.div>
          )}
        </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================
// CurationRow: 데스크탑 좌우 스크롤 버튼 + 키보드 + 페이드 마스크
// =============================================
function CurationRow({
  section,
  onProductClick,
}: {
  section: { id: string; title: string; subtitle: string; videos: Product[]; onShowAll?: () => void };
  onProductClick: (p: Product) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateButtons = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 개선 4: requestAnimationFrame으로 다음 프레임에 한 번 더 — 초기 dimensions 확정 후 정확
    requestAnimationFrame(updateButtons);
    el.addEventListener("scroll", updateButtons, { passive: true });
    window.addEventListener("resize", updateButtons);
    return () => {
      el.removeEventListener("scroll", updateButtons);
      window.removeEventListener("resize", updateButtons);
    };
  }, [section.videos.length]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.85;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  // 개선 3: 키보드 ← → 로 스크롤 (포커스됐을 때)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      scroll("left");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      scroll("right");
    }
  };

  // 개선 2: 양쪽 페이드 마스크 (스크롤 가능 시 fade-out으로 시각 단서)
  const maskStyle: React.CSSProperties = {};
  if (canLeft && canRight) {
    maskStyle.maskImage = "linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%)";
    maskStyle.WebkitMaskImage = "linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%)";
  } else if (canRight) {
    maskStyle.maskImage = "linear-gradient(to right, black 0%, black 96%, transparent 100%)";
    maskStyle.WebkitMaskImage = "linear-gradient(to right, black 0%, black 96%, transparent 100%)";
  } else if (canLeft) {
    maskStyle.maskImage = "linear-gradient(to right, transparent 0%, black 4%, black 100%)";
    maskStyle.WebkitMaskImage = "linear-gradient(to right, transparent 0%, black 4%, black 100%)";
  }

  return (
    <section className="mb-10 group/row">
      <div className="flex items-end justify-between px-4 md:px-6 mb-3">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">{section.title}</h2>
          <p className="text-sm text-gray-400 mt-0.5">{section.subtitle}</p>
        </div>
        {section.onShowAll && (
          <button
            onClick={section.onShowAll}
            className="flex-shrink-0 text-xs font-bold text-[#a78bfa] hover:text-white transition-colors flex items-center gap-1"
          >
            모두 보기 <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="relative">
        {/* 좌측 스크롤 버튼 — 개선 1: 항상 살짝 보이게 (opacity 50% → hover 100%) */}
        {canLeft && (
          <button
            onClick={() => scroll("left")}
            aria-label="이전"
            className="hidden [@media(hover:hover)]:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 w-12 h-24 items-center justify-center bg-gradient-to-r from-[#6366f1]/80 via-[#8b5cf6]/40 to-transparent text-white opacity-50 group-hover/row:opacity-100 hover:from-[#6366f1] hover:via-[#8b5cf6]/60 transition-all"
          >
            <ChevronLeft className="w-7 h-7 drop-shadow-lg" />
          </button>
        )}

        {/* 우측 스크롤 버튼 */}
        {canRight && (
          <button
            onClick={() => scroll("right")}
            aria-label="다음"
            className="hidden [@media(hover:hover)]:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 w-12 h-24 items-center justify-center bg-gradient-to-l from-[#6366f1]/80 via-[#8b5cf6]/40 to-transparent text-white opacity-50 group-hover/row:opacity-100 hover:from-[#6366f1] hover:via-[#8b5cf6]/60 transition-all"
          >
            <ChevronRight className="w-7 h-7 drop-shadow-lg" />
          </button>
        )}

        <div
          ref={scrollRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          role="region"
          aria-label={`${section.title} 캐러셀`}
          style={maskStyle}
          className="flex gap-3 overflow-x-auto px-4 md:px-6 pb-2 scrollbar-hide snap-x scroll-smooth focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1]/50 rounded-lg"
        >
          {section.videos.map((video) => (
            <motion.button
              key={`${section.id}-${video.id}`}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onProductClick(video)}
              className="flex-shrink-0 w-64 md:w-72 snap-start text-left group"
            >
              <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-white/10 group-hover:border-[#6366f1]/50 transition-colors">
                <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[9px] text-white font-bold uppercase tracking-tight">
                  {video.tool}
                </div>
                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded text-[9px] text-white font-bold">
                  {video.duration}
                </div>
              </div>
              <div className="mt-2 px-0.5">
                <p className="text-sm font-bold text-white truncate">{video.title}</p>
                <p className="text-xs text-gray-500 truncate">{video.creator}</p>
                <p className="text-sm font-extrabold text-[#f87171] mt-1">₩{video.price.toLocaleString()}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}