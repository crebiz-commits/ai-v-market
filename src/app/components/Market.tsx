import { useState, useMemo, useEffect } from "react";
import { Search, Filter, SlidersHorizontal, Loader2, Play, Eye, ShoppingCart } from "lucide-react";
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
const categories = ["전체", "인기급상승", "AI영화", "AI드라마", "AI애니메이션", "AI다큐멘터리", "AI뮤직비디오", "SF", "액션", "로맨스", "공포", "판타지", "드라마", "코미디", "자연/풍경", "추상", "기타"];
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
            highlightEnd: item.highlight_end || 10,
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

    // 인기급상승 카테고리 선택 시 자동으로 인기순 정렬 적용
    const effectiveSortBy = selectedCategory === "인기급상승" ? "popular" : sortBy;

    // 정렬 적용
    switch (effectiveSortBy) {
      case "latest":
        // 이미 fetch 단계에서 최신순으로 가져옴
        break;
      case "popular":
        // 인기도 데이터가 없으므로 가격 높은 순으로 대체
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

  // Prepare videos for CoverFlow - using top 10 products
  const coverFlowVideos = useMemo(() => {
    return products.slice(0, 10).map((product) => ({
      id: product.id,
      thumbnail: product.thumbnail,
      title: product.title,
      creator: product.creator,
      videoUrl: product.videoUrl, // Market.tsx fetching should be updated to include video_url
      duration: product.duration,
      resolution: product.resolution,
      tool: product.tool,
      price: product.price,
      highlightStart: product.highlightStart,
      highlightEnd: product.highlightEnd,
    }));
  }, [products]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#6366f1] mx-auto mb-4" />
          <p className="text-muted-foreground">상품을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Search Header */}
      <div className="flex-shrink-0 p-4 md:px-6 md:py-6 border-b border-border">
        <div className="md:max-w-7xl md:mx-auto">
          <div className="text-[10px] text-muted-foreground/30 mb-1">Market Component v1.0.4 (Categories Fixed)</div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              type="text"
              placeholder="AI 영상 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white'
                    : 'bg-card text-muted-foreground border border-border'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter & Sort Bar */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 md:px-6 border-b border-border">
        <div className="md:max-w-7xl md:mx-auto md:w-full flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  필터
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-card px-6">
                <SheetHeader className="mb-6">
                  <SheetTitle>상세 필터</SheetTitle>
                  <SheetDescription>원하는 조건으로 영상을 찾아보세요</SheetDescription>
                </SheetHeader>
                
                <div className="space-y-6">
                  {/* Price Range */}
                  <div className="px-1">
                    <Label className="mb-3 block">가격 범위</Label>
                    <Slider
                      min={0}
                      max={200000}
                      step={10000}
                      value={priceRange}
                      onValueChange={setPriceRange}
                      className="mb-2"
                    />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>₩{priceRange[0].toLocaleString()}</span>
                      <span>₩{priceRange[1].toLocaleString()}</span>
                    </div>
                  </div>

                  {/* AI Tools */}
                  <div className="px-1">
                    <Label className="mb-3 block">AI 툴</Label>
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
                        />
                        <label
                          htmlFor={tool}
                          className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {tool}
                        </label>
                      </div>
                    ))}
                  </div>

                  {/* Resolution */}
                  <div className="px-1">
                    <Label className="mb-3 block">해상도</Label>
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
                        />
                        <label
                          htmlFor={resolution}
                          className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {resolution}
                        </label>
                      </div>
                    ))}
                  </div>

                  {/* Genre */}
                  <div className="px-1">
                    <Label className="mb-3 block">장르</Label>
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
                        />
                        <label
                          htmlFor={genre}
                          className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {genre}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <span className="text-sm text-muted-foreground">
              {filteredProducts.length}개 상품
            </span>
          </div>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">최신순</SelectItem>
              <SelectItem value="popular">인기순</SelectItem>
              <SelectItem value="price-low">낮은 가격순</SelectItem>
              <SelectItem value="price-high">높은 가격순</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Featured Carousel Section */}
        <div className="flex-shrink-0 bg-gradient-to-b from-card/30 to-transparent border-b border-white/5 py-4">
          <CoverFlow videos={coverFlowVideos} hideControls={isFilterOpen} />
        </div>

        {/* Product Grid */}
        <div className="p-4 md:px-6 pb-8">
          <motion.div 
            layout
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8 md:max-w-7xl md:mx-auto"
          >
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ 
                    duration: 0.4, 
                    delay: index * 0.05,
                    ease: "easeOut" 
                  }}
                  onClick={() => onProductClick(product)}
                  className="group relative flex flex-col bg-card/40 backdrop-blur-md rounded-2xl overflow-hidden border border-white/10 hover:border-[#6366f1]/50 transition-all duration-500 cursor-pointer hover:shadow-[0_20px_40px_-15px_rgba(99,102,241,0.3)]"
                >
                  {/* Image Container with aspect ratio */}
                  <div className="relative aspect-[9/16] overflow-hidden">
                    <motion.img
                      src={product.thumbnail}
                      alt={product.title}
                      className="w-full h-full object-cover"
                      whileHover={{ scale: 1.05 }}
                      transition={{ duration: 0.6 }}
                    />
                    
                    {/* Glassmorphism Badges */}
                    <div className="absolute top-3 left-3 flex flex-col gap-2">
                      <div className="px-2.5 py-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-white text-[10px] font-bold tracking-wider uppercase">
                        {product.tool}
                      </div>
                    </div>

                    <div className="absolute top-3 right-3">
                      <div className="px-2 py-1 bg-[#6366f1]/80 backdrop-blur-md rounded-lg text-white text-[10px] font-bold shadow-lg">
                        {product.duration}
                      </div>
                    </div>

                    {/* Quick Preview Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4">
                      <div className="flex justify-center gap-3 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                        <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-[#6366f1] transition-colors">
                          <Eye className="w-5 h-5" />
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-[#6366f1] transition-colors">
                          <ShoppingCart className="w-5 h-5" />
                        </div>
                      </div>
                    </div>
                    
                  </div>
                  
                  {/* Info Section */}
                  <div className="p-4 bg-gradient-to-b from-card/80 to-card flex flex-col flex-1">
                    <div className="flex-1">
                      <h3 className="font-bold text-white text-base mb-1 line-clamp-1 group-hover:text-[#6366f1] transition-colors">
                        {product.title}
                      </h3>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-[#6366f1] to-[#8b5cf6]" />
                        <span className="text-xs text-muted-foreground/80 font-medium">{product.creator}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-3 border-t border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-tighter">Price</span>
                        <span className="text-lg font-black text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                          ₩{product.price.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-tighter">Res</span>
                        <span className="text-xs font-bold text-[#6366f1]">{product.resolution}</span>
                      </div>
                    </div>
                  </div>

                  {/* Top Shine Effect */}
                  <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}