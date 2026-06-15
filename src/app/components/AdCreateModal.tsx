// ════════════════════════════════════════════════════════════════════════════
// 광고 생성/수정 모달 — 광고주 셀프서비스
//   광고 유형: ① 오버레이 배너(이미지) ② 영상 프리롤(동영상)
//   저장 → advertiser_create_ad / advertiser_update_ad RPC. "저장 후 제출" → advertiser_submit_ad.
//   이미지 = ad-images 스토리지 업로드 / 영상 = Bunny(create-upload + TUS) 업로드.
// ════════════════════════════════════════════════════════════════════════════
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, Image as ImageIcon, Send, Upload, Film, Check } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { uploadAdVideo } from "../utils/adVideoUpload";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface AdvertiserAd {
  id: string;
  title: string;
  status: string;
  image_url: string | null;
  video_url?: string | null;
  link_url: string;
  cta_text: string;
  format?: string;
}

interface Props {
  open: boolean;
  editAd?: AdvertiserAd | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AdCreateModal({ open, editAd, onClose, onSaved }: Props) {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const isKo = (i18n.language || "en").startsWith("ko");
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  // 광고 유형 4종 — 노출면(surface) 상호 배타. (오버레이가 피드에도 뜨던 충돌 제거)
  //   overlay    → 오버레이 배너  (format='overlay', ad_type='overlay')      : 영상 위 작은 배너 (이미지)
  //   feed_image → 피드 이미지카드(format='feed',    ad_type='feed_display') : 홈 피드 풀스크린 이미지 카드
  //   feed_video → 피드 영상카드  (format='feed',    ad_type='feed_display') : 홈 피드 풀스크린 영상 카드(자동재생)
  //   preroll    → 영상 프리롤    (format='preroll', ad_type='video_preroll'): 본편 시작 전 풀스크린 영상
  type AdKind = "overlay" | "feed_image" | "feed_video" | "preroll";
  const initialKind: AdKind =
    editAd?.format === "preroll" ? "preroll"
    : editAd?.format === "overlay" ? "overlay"
    : editAd?.format === "feed" ? (editAd?.video_url ? "feed_video" : "feed_image")
    : editAd?.video_url ? "feed_video"
    : "overlay";
  const [kind, setKind] = useState<AdKind>(initialKind);
  const isImageKind = kind === "overlay" || kind === "feed_image";
  const isVideoKind = kind === "feed_video" || kind === "preroll";
  // 승인/심사중 광고 편집 → 재심사 흐름. submit RPC를 또 부르면 안 되고(이미 pending) 단일 저장만.
  const reReview = !!editAd && (editAd.status === "approved" || editAd.status === "pending_review");
  const [title, setTitle] = useState(editAd?.title || "");
  const [imageUrl, setImageUrl] = useState(editAd?.image_url || "");
  const [videoUrl, setVideoUrl] = useState(editAd?.video_url || "");
  const [thumbUrl, setThumbUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState(editAd?.link_url || "");
  const [ctaText, setCtaText] = useState(editAd?.cta_text || (isKo ? "자세히 보기" : "Learn more"));
  const [advertiser, setAdvertiser] = useState("");
  const [busy, setBusy] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [vidUploading, setVidUploading] = useState(false);
  const [vidProgress, setVidProgress] = useState(0);
  const [imgError, setImgError] = useState(false);

  const handleImageUpload = async (file: File | undefined) => {
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) { toast.error(isKo ? "이미지 파일만 가능합니다." : "Images only."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(isKo ? "10MB 이하만 가능합니다." : "Max 10MB."); return; }
    setImgUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("ad-images").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      setImageUrl(supabase.storage.from("ad-images").getPublicUrl(path).data.publicUrl);
      toast.success(isKo ? "이미지를 업로드했어요." : "Uploaded.");
    } catch (e: any) {
      toast.error((isKo ? "업로드 실패: " : "Upload failed: ") + (e?.message || ""));
    } finally { setImgUploading(false); }
  };

  const handleVideoUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error(isKo ? "동영상 파일만 가능합니다." : "Video only."); return; }
    if (file.size > 300 * 1024 * 1024) { toast.error(isKo ? "300MB 이하만 가능합니다." : "Max 300MB."); return; }
    setVidUploading(true); setVidProgress(0);
    try {
      const { videoUrl: vu, thumbnailUrl: tu } = await uploadAdVideo(file, setVidProgress);
      setVideoUrl(vu); setThumbUrl(tu);
      toast.success(isKo ? "영상을 업로드했어요. 인코딩 후 노출됩니다." : "Uploaded. Encoding…");
    } catch (e: any) {
      toast.error((isKo ? "영상 업로드 실패: " : "Video upload failed: ") + (e?.message || ""));
    } finally { setVidUploading(false); }
  };

  const mediaReady = isImageKind ? !!imageUrl.trim() : !!videoUrl.trim();
  const valid = title.trim() && linkUrl.trim() && mediaReady && !imgUploading && !vidUploading;

  const save = async (submit: boolean) => {
    if (!valid) {
      toast.error(isKo ? "광고명·링크·소재(이미지/영상)는 필수입니다." : "Title, link, and creative are required.");
      return;
    }
    setBusy(true);
    try {
      // 유형별 DB 매핑 — 노출면 상호 배타: format(오버레이/프리롤 게이트) + ad_type(피드/프리롤 게이트)
      const fmt = kind === "overlay" ? "overlay" : kind === "preroll" ? "preroll" : "feed";
      const adType = kind === "overlay" ? "overlay" : kind === "preroll" ? "video_preroll" : "feed_display";
      let adId = editAd?.id;
      if (editAd) {
        const { error } = await supabase.rpc("advertiser_update_ad", {
          p_ad_id: editAd.id, p_title: title.trim(), p_link_url: linkUrl.trim(), p_cta_text: ctaText.trim(),
          p_image_url: isImageKind ? imageUrl.trim() : null,
          p_video_url: isVideoKind ? videoUrl.trim() : null,
          p_thumbnail_url: isVideoKind ? (thumbUrl || null) : null,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.rpc("advertiser_create_ad", {
          p_title: title.trim(),
          p_format: fmt,
          p_ad_type: adType,
          p_link_url: linkUrl.trim(), p_cta_text: ctaText.trim(),
          p_image_url: isImageKind ? imageUrl.trim() : null,
          p_video_url: isVideoKind ? videoUrl.trim() : null,
          p_thumbnail_url: isVideoKind ? (thumbUrl || null) : null,
          p_advertiser: advertiser.trim() || null,
        });
        if (error) throw error;
        adId = data as string;
      }
      if (submit && adId) {
        const { error: subErr } = await supabase.rpc("advertiser_submit_ad", { p_ad_id: adId });
        if (subErr) throw subErr;
        toast.success(isKo ? "광고를 심사 제출했어요. 승인 후 노출됩니다." : "Submitted for review.");
      } else if (reReview) {
        toast.success(isKo ? "수정 사항을 저장했어요. 다시 심사를 거치며, 재승인되면 노출이 자동 재개됩니다." : "Saved. It will be re-reviewed; serving resumes once re-approved.");
      } else {
        toast.success(isKo ? "저장했어요." : "Saved.");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error((isKo ? "오류: " : "Error: ") + (e?.message || ""));
    } finally { setBusy(false); }
  };

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#8b5cf6]";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150]" />
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[151] mx-auto max-w-md max-h-[88vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
              <h3 className="font-bold text-base">{editAd ? (isKo ? "광고 수정" : "Edit ad") : (isKo ? "새 광고 만들기" : "New ad")}</h3>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              {/* 광고 유형 (새 광고만) — 4종 / 노출면 상호 배타 */}
              {!editAd && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["overlay", isKo ? "오버레이 배너" : "Overlay", ImageIcon],
                      ["feed_image", isKo ? "피드 이미지" : "Feed image", ImageIcon],
                      ["feed_video", isKo ? "피드 영상" : "Feed video", Film],
                      ["preroll", isKo ? "영상 프리롤" : "Preroll", Film],
                    ] as const).map(([k, label, Icon]) => (
                      <button key={k} type="button" onClick={() => setKind(k)}
                        className={`py-2.5 px-1 rounded-lg text-[13px] font-bold border flex items-center justify-center gap-1.5 transition-colors ${kind === k ? "bg-[#8b5cf6] text-white border-[#8b5cf6]" : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"}`}>
                        <Icon className="w-4 h-4 shrink-0" />{label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    {kind === "overlay"
                      ? (isKo ? "영상 재생 중 하단에 뜨는 작은 배너(이미지)로만 노출됩니다." : "Small banner shown over playing videos only.")
                      : kind === "feed_image"
                      ? (isKo ? "홈 피드에 풀스크린 이미지 카드로만 노출됩니다." : "Full-screen image card in the home feed only.")
                      : kind === "feed_video"
                      ? (isKo ? "홈 피드에 풀스크린 영상 카드(자동재생·무음)로만 노출됩니다." : "Full-screen autoplay video card in the home feed only.")
                      : (isKo ? "본편 영상 시작 전 풀스크린 영상으로 재생됩니다." : "Full-screen video played before the main video.")}
                  </p>
                </div>
              )}

              {/* 비용 안내 — 노출당 단가 + 예산 충전제 설명 (전 형식 ₩2/노출 동일) */}
              <div className="rounded-lg border border-[#8b5cf6]/25 bg-[#8b5cf6]/5 px-3 py-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#c4b5fd]">{isKo ? "💰 비용" : "💰 Cost"}</span>
                  <span className="text-[13px] font-black text-white">{isKo ? "노출당 ₩2" : "₩2 / imp"}</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  {isKo ? "CPM ₩2,000 기준 노출 1회당 ₩2 차감 (모든 형식 동일). 클릭은 무료."
                        : "₩2 per impression (CPM ₩2,000), same for all formats. Clicks are free."}
                </p>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  {isKo ? "예) ₩10,000 충전 → 약 5,000회 노출. 승인 후 충전한 예산만큼만 노출되고, 소진되면 자동 중단됩니다."
                        : "e.g. ₩10,000 → ~5,000 impressions. Serves only up to your topped-up budget; auto-stops when depleted."}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">{isKo ? "광고명" : "Ad name"}</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
                  placeholder={isKo ? "예: 여름 세일 프로모션" : "e.g. Summer sale"} className={inputCls} />
              </div>

              {!editAd && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5">{isKo ? "광고주명 (선택)" : "Advertiser (optional)"}</label>
                  <input value={advertiser} onChange={(e) => setAdvertiser(e.target.value)} maxLength={60}
                    placeholder={isKo ? "표시될 브랜드명" : "Brand name"} className={inputCls} />
                </div>
              )}

              {/* 소재 — 이미지 (오버레이 배너 / 피드 이미지 카드) */}
              {isImageKind && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-gray-400">{kind === "overlay" ? (isKo ? "배너 이미지" : "Banner image") : (isKo ? "피드 카드 이미지" : "Feed card image")}</label>
                    <button type="button" onClick={() => imgRef.current?.click()} disabled={imgUploading}
                      className="text-[11px] font-bold text-[#a78bfa] hover:text-white flex items-center gap-1 disabled:opacity-50">
                      {imgUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}{isKo ? "파일 업로드" : "Upload"}
                    </button>
                    <input ref={imgRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { handleImageUpload(e.target.files?.[0]); e.target.value = ""; }} />
                  </div>
                  <input value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); setImgError(false); }}
                    placeholder={kind === "overlay" ? (isKo ? "업로드 또는 이미지 URL (300×250 권장)" : "Upload or paste URL (300×250)") : (isKo ? "업로드 또는 이미지 URL (세로 9:16 권장)" : "Upload or paste URL (9:16)")} className={inputCls} />
                  {imageUrl.trim() ? (
                    imgError ? (
                      <p className="mt-2 text-[11px] text-red-300 bg-red-500/10 rounded-md px-2 py-2 leading-relaxed">
                        {isKo
                          ? "⚠️ 이미지를 불러올 수 없습니다. 웹페이지 주소가 아니라 실제 이미지 파일(.jpg/.png)이어야 합니다. 「파일 업로드」를 권장합니다."
                          : "⚠️ Can't load image. It must be a direct image file (.jpg/.png), not a webpage URL. Use Upload instead."}
                      </p>
                    ) : (
                      <div className="mt-2 rounded-lg overflow-hidden border border-white/10 bg-black/30 aspect-[6/5] flex items-center justify-center">
                        <img src={imageUrl} alt="preview" className="max-w-full max-h-full object-contain" onError={() => setImgError(true)} />
                      </div>
                    )
                  ) : (
                    <p className="mt-1.5 text-[11px] text-gray-500 flex items-center gap-1"><ImageIcon className="w-3 h-3" />{kind === "overlay" ? (isKo ? "영상 위 작은 오버레이 배너로 노출됩니다." : "Shows as a small overlay banner over videos.") : (isKo ? "홈 피드에 풀스크린 이미지 카드로 노출됩니다." : "Shows as a full-screen image card in the feed.")}</p>
                  )}
                </div>
              )}

              {/* 소재 — 영상 (피드 풀스크린 / 프리롤 공용 업로드) */}
              {isVideoKind && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5">{kind === "feed_video" ? (isKo ? "광고 영상 (피드 풀스크린)" : "Ad video (feed)") : (isKo ? "광고 영상 (프리롤)" : "Ad video (preroll)")}</label>
                  <input ref={vidRef} type="file" accept="video/*" className="hidden"
                    onChange={(e) => { handleVideoUpload(e.target.files?.[0]); e.target.value = ""; }} />
                  {vidUploading ? (
                    <div className="p-4 rounded-lg border border-white/10 bg-white/5">
                      <div className="flex items-center gap-2 text-sm text-gray-300 mb-2"><Loader2 className="w-4 h-4 animate-spin" />{isKo ? "업로드 중…" : "Uploading…"} {vidProgress}%</div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" style={{ width: `${vidProgress}%` }} /></div>
                    </div>
                  ) : videoUrl ? (
                    <button type="button" onClick={() => vidRef.current?.click()}
                      className="w-full p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-2 text-sm text-emerald-300 hover:bg-emerald-500/15">
                      <Check className="w-4 h-4" />{isKo ? "영상 업로드 완료 — 다시 올리려면 클릭" : "Uploaded — click to replace"}
                    </button>
                  ) : (
                    <button type="button" onClick={() => vidRef.current?.click()}
                      className="w-full p-4 rounded-lg border-2 border-dashed border-white/15 hover:border-[#8b5cf6]/50 flex flex-col items-center gap-1 text-sm text-gray-400">
                      <Upload className="w-6 h-6" />{isKo ? "광고 영상 업로드 (최대 300MB)" : "Upload ad video (≤300MB)"}
                      <span className="text-[11px] text-gray-500">
                        {kind === "feed_video"
                          ? (isKo ? "세로 영상 권장 (9:16). 피드에서 자동재생·무음 루프로 노출됩니다." : "Vertical 9:16 recommended. Autoplays muted in feed.")
                          : (isKo ? "짧은 프리롤 영상 권장 (15~30초). 영상 시작 전 재생됩니다." : "Short preroll recommended (15–30s).")}
                      </span>
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">{isKo ? "클릭 시 이동할 링크" : "Click-through link"}</label>
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">{isKo ? "버튼 문구 (CTA)" : "CTA text"}</label>
                <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} maxLength={20} className={inputCls} />
              </div>

              {reReview ? (
                <p className="text-[11px] text-amber-300/90 bg-amber-500/10 rounded-md px-2.5 py-2 leading-relaxed">
                  {isKo ? "⚠️ 승인된 광고를 수정하면 다시 심사를 거칩니다. 재승인 전까지 노출이 일시 중단되며, 재승인되면 자동으로 재개됩니다."
                        : "⚠️ Editing an approved ad triggers re-review. Serving pauses until re-approved, then resumes automatically."}
                </p>
              ) : (
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  {isKo ? "저장 후 「심사 제출」하면 운영팀 검토를 거쳐 승인됩니다. 승인 후 예산을 충전하면 노출이 시작됩니다."
                        : "Submit for review after saving. Once approved, top up budget to start serving."}
                </p>
              )}
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-border sticky bottom-0 bg-card">
              {reReview ? (
                <Button onClick={() => save(false)} disabled={busy || !valid}
                  className="flex-1 gap-1.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />{isKo ? "저장 후 재심사 요청" : "Save & re-review"}</>}
                </Button>
              ) : (
                <>
                  <Button onClick={() => save(false)} disabled={busy || !valid} variant="outline" className="flex-1">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (isKo ? "임시 저장" : "Save draft")}
                  </Button>
                  <Button onClick={() => save(true)} disabled={busy || !valid}
                    className="flex-1 gap-1.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />{isKo ? "저장 후 제출" : "Save & submit"}</>}
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
