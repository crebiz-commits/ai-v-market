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
import { HOME_FEED_SELF_ADS } from "../config/ads";

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
  const { t } = useTranslation();
  const { user } = useAuth();
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const vidAbortRef = useRef<AbortController | null>(null);  // 업로드 중 모달 닫으면 취소

  // 광고 유형 4종 — 노출면(surface) 상호 배타. (오버레이가 피드에도 뜨던 충돌 제거)
  //   overlay    → 오버레이 배너  (format='overlay', ad_type='overlay')      : 영상 위 작은 배너 (이미지)
  //   feed_image → 피드 이미지카드(format='feed',    ad_type='feed_display') : 홈 피드 풀스크린 이미지 카드
  //   feed_video → 피드 영상카드  (format='feed',    ad_type='feed_display') : 홈 피드 풀스크린 영상 카드(자동재생)
  //   preroll    → 영상 프리롤    (format='preroll', ad_type='video_preroll'): 본편 시작 전 풀스크린 영상
  type AdKind = "overlay" | "feed_image" | "feed_video" | "preroll" | "hero";
  const initialKind: AdKind =
    editAd?.format === "hero" ? "hero"
    : editAd?.format === "preroll" ? "preroll"
    : editAd?.format === "overlay" ? "overlay"
    : editAd?.format === "feed" ? (editAd?.video_url ? "feed_video" : "feed_image")
    : editAd?.video_url ? "feed_video"
    : "overlay";
  const [kind, setKind] = useState<AdKind>(initialKind);
  const isImageKind = kind === "overlay" || kind === "feed_image";
  const isVideoKind = kind === "feed_video" || kind === "preroll" || kind === "hero";
  // 승인/심사중 광고 편집 → 재심사 흐름. submit RPC를 또 부르면 안 되고(이미 pending) 단일 저장만.
  const reReview = !!editAd && (editAd.status === "approved" || editAd.status === "pending_review");
  const [title, setTitle] = useState(editAd?.title || "");
  const [imageUrl, setImageUrl] = useState(editAd?.image_url || "");
  const [videoUrl, setVideoUrl] = useState(editAd?.video_url || "");
  const [thumbUrl, setThumbUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState(editAd?.link_url || "");
  const [ctaText, setCtaText] = useState(editAd?.cta_text || t("ads.create.ctaDefault"));
  const [advertiser, setAdvertiser] = useState("");
  const [busy, setBusy] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [vidUploading, setVidUploading] = useState(false);
  const [vidProgress, setVidProgress] = useState(0);
  const [imgError, setImgError] = useState(false);

  const handleImageUpload = async (file: File | undefined) => {
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) { toast.error(t("ads.create.imageOnly")); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("ads.create.imageTooLarge")); return; }
    setImgUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("ad-images").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      setImageUrl(supabase.storage.from("ad-images").getPublicUrl(path).data.publicUrl);
      toast.success(t("ads.create.imageUploaded"));
    } catch (e: any) {
      toast.error(t("ads.create.uploadFailed", { message: e?.message || "" }));
    } finally { setImgUploading(false); }
  };

  const handleVideoUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error(t("ads.create.videoOnly")); return; }
    if (file.size > 300 * 1024 * 1024) { toast.error(t("ads.create.videoTooLarge")); return; }
    vidAbortRef.current?.abort();  // 이전 업로드(교체 시) 중단 → Bunny 고아·경쟁 방지
    const ctrl = new AbortController();
    vidAbortRef.current = ctrl;
    setVidUploading(true); setVidProgress(0);
    try {
      const { videoUrl: vu, thumbnailUrl: tu } = await uploadAdVideo(file, setVidProgress, ctrl.signal);
      if (ctrl.signal.aborted) return;  // 취소됐으면 상태 반영 안 함(언마운트/교체)
      setVideoUrl(vu); setThumbUrl(tu);
      toast.success(t("ads.create.videoUploaded"));
    } catch (e: any) {
      if (ctrl.signal.aborted) return;  // 취소로 인한 에러는 조용히
      toast.error(t("ads.create.videoUploadFailed", { message: e?.message || "" }));
    } finally {
      if (vidAbortRef.current === ctrl) { vidAbortRef.current = null; setVidUploading(false); }
    }
  };

  // 모달 닫기 — 진행 중 업로드 취소(300MB 백그라운드 전송 방지) 후 닫음.
  const handleClose = () => { vidAbortRef.current?.abort(); onClose(); };

  const mediaReady = isImageKind ? !!imageUrl.trim() : !!videoUrl.trim();
  const valid = title.trim() && linkUrl.trim() && mediaReady && !imgUploading && !vidUploading;

  const save = async (submit: boolean) => {
    if (!valid) {
      toast.error(t("ads.create.requiredFields"));
      return;
    }
    setBusy(true);
    try {
      // 유형별 DB 매핑 — 노출면 상호 배타: format(오버레이/프리롤 게이트) + ad_type(피드/프리롤 게이트)
      const fmt = kind === "overlay" ? "overlay" : kind === "preroll" ? "preroll" : kind === "hero" ? "hero" : "feed";
      const adType = kind === "overlay" ? "overlay" : kind === "preroll" ? "video_preroll" : kind === "hero" ? "hero_display" : "feed_display";
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
        toast.success(t("ads.create.submitted"));
      } else if (reReview) {
        toast.success(t("ads.create.savedReReview"));
      } else {
        toast.success(t("ads.create.saved"));
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(t("ads.common.error", { message: e?.message || "" }));
    } finally { setBusy(false); }
  };

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#8b5cf6]";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150]" />
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[151] mx-auto max-w-md max-h-[88vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
              <h3 className="font-bold text-base">{editAd ? t("ads.create.titleEdit") : t("ads.create.titleNew")}</h3>
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              {/* 광고 유형 (새 광고만) — 4종 / 노출면 상호 배타 */}
              {!editAd && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["overlay", t("ads.create.kindOverlay"), ImageIcon],
                      ["feed_image", t("ads.create.kindFeedImage"), ImageIcon],
                      ["feed_video", t("ads.create.kindFeedVideo"), Film],
                      ["preroll", t("ads.create.kindPreroll"), Film],
                      ["hero", t("ads.create.kindHero"), Film],
                    ] as const)
                      // 피드 자체광고 노출면(HOME_FEED_SELF_ADS)이 꺼진 동안엔 피드 상품 판매 중단
                      // — 노출면 없는 광고를 팔면 "결제됐는데 노출 0" 분쟁이 됨 (config/ads.ts 참조)
                      .filter(([k]) => HOME_FEED_SELF_ADS || (k !== "feed_image" && k !== "feed_video"))
                      .map(([k, label, Icon]) => (
                      <button key={k} type="button" onClick={() => setKind(k)}
                        className={`py-2.5 px-1 rounded-lg text-[13px] font-bold border flex items-center justify-center gap-1.5 transition-colors ${kind === k ? "bg-[#8b5cf6] text-white border-[#8b5cf6]" : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"}`}>
                        <Icon className="w-4 h-4 shrink-0" />{label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    {kind === "overlay"
                      ? t("ads.create.kindOverlayDesc")
                      : kind === "feed_image"
                      ? t("ads.create.kindFeedImageDesc")
                      : kind === "feed_video"
                      ? t("ads.create.kindFeedVideoDesc")
                      : kind === "hero"
                      ? t("ads.create.kindHeroDesc")
                      : t("ads.create.kindPrerollDesc")}
                  </p>
                </div>
              )}

              {/* 비용 안내 — 노출당 단가 + 예산 충전제 설명 (전 형식 ₩2/노출 동일) */}
              <div className="rounded-lg border border-[#8b5cf6]/25 bg-[#8b5cf6]/5 px-3 py-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#c4b5fd]">{t("ads.create.costTitle")}</span>
                  <span className="text-[13px] font-black text-white">{t("ads.create.costPerImpression")}</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  {t("ads.create.costLine1")}
                </p>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  {t("ads.create.costLine2")}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">{t("ads.create.nameLabel")}</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
                  placeholder={t("ads.create.namePlaceholder")} className={inputCls} />
              </div>

              {!editAd && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5">{t("ads.create.advertiserLabel")}</label>
                  <input value={advertiser} onChange={(e) => setAdvertiser(e.target.value)} maxLength={60}
                    placeholder={t("ads.create.advertiserPlaceholder")} className={inputCls} />
                </div>
              )}

              {/* 소재 — 이미지 (오버레이 배너 / 피드 이미지 카드) */}
              {isImageKind && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-gray-400">{kind === "overlay" ? t("ads.create.bannerImageLabel") : t("ads.create.feedImageLabel")}</label>
                    <button type="button" onClick={() => imgRef.current?.click()} disabled={imgUploading}
                      className="text-[11px] font-bold text-[#a78bfa] hover:text-white flex items-center gap-1 disabled:opacity-50">
                      {imgUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}{t("ads.create.uploadFile")}
                    </button>
                    <input ref={imgRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { handleImageUpload(e.target.files?.[0]); e.target.value = ""; }} />
                  </div>
                  <input value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); setImgError(false); }}
                    placeholder={kind === "overlay" ? t("ads.create.imageUrlPlaceholderOverlay") : t("ads.create.imageUrlPlaceholderFeed")} className={inputCls} />
                  {imageUrl.trim() ? (
                    imgError ? (
                      <p className="mt-2 text-[11px] text-red-300 bg-red-500/10 rounded-md px-2 py-2 leading-relaxed">
                        {t("ads.create.imageLoadError")}
                      </p>
                    ) : (
                      <div className="mt-2 rounded-lg overflow-hidden border border-white/10 bg-black/30 aspect-[6/5] flex items-center justify-center">
                        <img src={imageUrl} alt={t("ads.create.previewAlt")} className="max-w-full max-h-full object-contain" onError={() => setImgError(true)} />
                      </div>
                    )
                  ) : (
                    <p className="mt-1.5 text-[11px] text-gray-500 flex items-center gap-1"><ImageIcon className="w-3 h-3" />{kind === "overlay" ? t("ads.create.imageHintOverlay") : t("ads.create.imageHintFeed")}</p>
                  )}
                </div>
              )}

              {/* 소재 — 영상 (피드 풀스크린 / 프리롤 공용 업로드) */}
              {isVideoKind && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5">{kind === "feed_video" ? t("ads.create.videoLabelFeed") : t("ads.create.videoLabelPreroll")}</label>
                  <input ref={vidRef} type="file" accept="video/*" className="hidden"
                    onChange={(e) => { handleVideoUpload(e.target.files?.[0]); e.target.value = ""; }} />
                  {vidUploading ? (
                    <div className="p-4 rounded-lg border border-white/10 bg-white/5">
                      <div className="flex items-center gap-2 text-sm text-gray-300 mb-2"><Loader2 className="w-4 h-4 animate-spin" />{t("ads.create.uploadingPct", { pct: vidProgress })}</div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" style={{ width: `${vidProgress}%` }} /></div>
                    </div>
                  ) : videoUrl ? (
                    <button type="button" onClick={() => vidRef.current?.click()}
                      className="w-full p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-2 text-sm text-emerald-300 hover:bg-emerald-500/15">
                      <Check className="w-4 h-4" />{t("ads.create.videoReplace")}
                    </button>
                  ) : (
                    <button type="button" onClick={() => vidRef.current?.click()}
                      className="w-full p-4 rounded-lg border-2 border-dashed border-white/15 hover:border-[#8b5cf6]/50 flex flex-col items-center gap-1 text-sm text-gray-400">
                      <Upload className="w-6 h-6" />{t("ads.create.videoUploadCta")}
                      <span className="text-[11px] text-gray-500">
                        {kind === "feed_video"
                          ? t("ads.create.videoHintFeed")
                          : t("ads.create.videoHintPreroll")}
                      </span>
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">{t("ads.create.linkLabel")}</label>
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">{t("ads.create.ctaLabel")}</label>
                <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} maxLength={20} className={inputCls} />
              </div>

              {reReview ? (
                <p className="text-[11px] text-amber-300/90 bg-amber-500/10 rounded-md px-2.5 py-2 leading-relaxed">
                  {t("ads.create.reReviewNotice")}
                </p>
              ) : (
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  {t("ads.create.submitHint")}
                </p>
              )}
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-border sticky bottom-0 bg-card">
              {reReview ? (
                <Button onClick={() => save(false)} disabled={busy || !valid}
                  className="flex-1 gap-1.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />{t("ads.create.saveReReview")}</>}
                </Button>
              ) : (
                <>
                  <Button onClick={() => save(false)} disabled={busy || !valid} variant="outline" className="flex-1">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("ads.create.saveDraft")}
                  </Button>
                  <Button onClick={() => save(true)} disabled={busy || !valid}
                    className="flex-1 gap-1.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />{t("ads.create.saveSubmit")}</>}
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
