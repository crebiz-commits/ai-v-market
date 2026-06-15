// ════════════════════════════════════════════════════════════════════════════
// 광고 생성/수정 모달 — 광고주 셀프서비스 Phase 2
//   MVP: 오버레이 배너 광고(이미지 + 링크 + CTA). 영상 프리롤은 후속.
//   저장 → advertiser_create_ad / advertiser_update_ad RPC.
//   "저장 후 심사 제출" → advertiser_submit_ad.
// ════════════════════════════════════════════════════════════════════════════
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, Image as ImageIcon, Send, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface AdvertiserAd {
  id: string;
  title: string;
  status: string;
  image_url: string | null;
  link_url: string;
  cta_text: string;
  format?: string;
}

interface Props {
  open: boolean;
  editAd?: AdvertiserAd | null;   // 있으면 수정 모드
  onClose: () => void;
  onSaved: () => void;            // 저장/제출 후 목록 갱신
}

export function AdCreateModal({ open, editAd, onClose, onSaved }: Props) {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const isKo = (i18n.language || "en").startsWith("ko");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File | undefined) => {
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) { toast.error(isKo ? "이미지 파일만 업로드 가능합니다." : "Images only."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(isKo ? "10MB 이하만 가능합니다." : "Max 10MB."); return; }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("ad-images").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("ad-images").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      toast.success(isKo ? "이미지를 업로드했어요." : "Uploaded.");
    } catch (e: any) {
      toast.error((isKo ? "업로드 실패: " : "Upload failed: ") + (e?.message || ""));
    } finally {
      setUploading(false);
    }
  };
  const [title, setTitle] = useState(editAd?.title || "");
  const [imageUrl, setImageUrl] = useState(editAd?.image_url || "");
  const [linkUrl, setLinkUrl] = useState(editAd?.link_url || "");
  const [ctaText, setCtaText] = useState(editAd?.cta_text || (isKo ? "자세히 보기" : "Learn more"));
  const [advertiser, setAdvertiser] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = title.trim() && linkUrl.trim() && imageUrl.trim();

  const save = async (submit: boolean) => {
    if (!valid) {
      toast.error(isKo ? "광고명·이미지·링크는 필수입니다." : "Title, image, and link are required.");
      return;
    }
    setBusy(true);
    try {
      let adId = editAd?.id;
      if (editAd) {
        const { error } = await supabase.rpc("advertiser_update_ad", {
          p_ad_id: editAd.id, p_title: title.trim(), p_link_url: linkUrl.trim(),
          p_cta_text: ctaText.trim(), p_image_url: imageUrl.trim(), p_video_url: null, p_thumbnail_url: null,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.rpc("advertiser_create_ad", {
          p_title: title.trim(), p_format: "overlay", p_ad_type: "feed_display", p_link_url: linkUrl.trim(),
          p_cta_text: ctaText.trim(), p_image_url: imageUrl.trim(), p_video_url: null,
          p_thumbnail_url: null, p_advertiser: advertiser.trim() || null,
        });
        if (error) throw error;
        adId = data as string;
      }
      if (submit && adId) {
        const { error: subErr } = await supabase.rpc("advertiser_submit_ad", { p_ad_id: adId });
        if (subErr) throw subErr;
        toast.success(isKo ? "광고를 심사 제출했어요. 승인 후 노출됩니다." : "Submitted for review.");
      } else {
        toast.success(isKo ? "저장했어요." : "Saved.");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error((isKo ? "오류: " : "Error: ") + (e?.message || ""));
    } finally {
      setBusy(false);
    }
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

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-400">{isKo ? "배너 이미지" : "Banner image"}</label>
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="text-[11px] font-bold text-[#a78bfa] hover:text-white flex items-center gap-1 disabled:opacity-50">
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    {isKo ? "파일 업로드" : "Upload"}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ""; }} />
                </div>
                <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
                  placeholder={isKo ? "업로드 또는 이미지 URL 붙여넣기 (300×250 권장)" : "Upload or paste URL"} className={inputCls} />
                {imageUrl.trim() ? (
                  <div className="mt-2 rounded-lg overflow-hidden border border-white/10 bg-black/30 aspect-[6/5] flex items-center justify-center">
                    <img src={imageUrl} alt="preview" className="max-w-full max-h-full object-contain"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                  </div>
                ) : (
                  <p className="mt-1.5 text-[11px] text-gray-500 flex items-center gap-1"><ImageIcon className="w-3 h-3" />{isKo ? "호스팅된 이미지 주소를 붙여넣어 주세요." : "Paste a hosted image URL."}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">{isKo ? "클릭 시 이동할 링크" : "Click-through link"}</label>
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">{isKo ? "버튼 문구 (CTA)" : "CTA text"}</label>
                <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} maxLength={20} className={inputCls} />
              </div>

              <p className="text-[11px] text-gray-500 leading-relaxed">
                {isKo ? "저장 후 「심사 제출」하면 운영팀 검토를 거쳐 승인됩니다. 승인 후 예산을 충전하면 노출이 시작됩니다."
                      : "Submit for review after saving. Once approved, top up budget to start serving."}
              </p>
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-border sticky bottom-0 bg-card">
              <Button onClick={() => save(false)} disabled={busy || !valid} variant="outline" className="flex-1">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (isKo ? "임시 저장" : "Save draft")}
              </Button>
              <Button onClick={() => save(true)} disabled={busy || !valid}
                className="flex-1 gap-1.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />{isKo ? "저장 후 제출" : "Save & submit"}</>}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
