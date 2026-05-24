// ════════════════════════════════════════════════════════════════════════════
// Phase 32 — 세금 정보 등록 섹션 (MyPage 설정 탭)
//
// 동작:
//   - 진입 시: get_my_tax_info RPC로 현재 정보 로드
//   - 비사업자/사업자 라디오 → 사업자 선택 시 추가 필드 (business_number/name/email)
//   - 저장 시: update_my_tax_info RPC
//
// 정책:
//   - 비사업자 (individual): 정산 시 3.3% 원천징수
//   - 사업자 (business_simple/general/corp): 세금계산서 별도 발행
//   - 미등록: 자동으로 individual 처리
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { FileText, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

type TaxType = "individual" | "business_simple" | "business_general" | "business_corp";

interface TaxInfo {
  tax_type: TaxType | null;
  business_number: string | null;
  business_name: string | null;
  tax_invoice_email: string | null;
  tax_consent_at: string | null;
}

interface TaxTypeOption {
  value: TaxType;
  labelKey: string;
  descKey: string;
}

const TAX_TYPE_OPTIONS: TaxTypeOption[] = [
  { value: "individual",       labelKey: "taxInfoSection.options.individualLabel", descKey: "taxInfoSection.options.individualDesc" },
  { value: "business_simple",  labelKey: "taxInfoSection.options.simpleLabel",     descKey: "taxInfoSection.options.simpleDesc" },
  { value: "business_general", labelKey: "taxInfoSection.options.generalLabel",    descKey: "taxInfoSection.options.generalDesc" },
  { value: "business_corp",    labelKey: "taxInfoSection.options.corpLabel",       descKey: "taxInfoSection.options.corpDesc" },
];

export function TaxInfoSection() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentInfo, setCurrentInfo] = useState<TaxInfo | null>(null);

  // 폼 상태
  const [taxType, setTaxType] = useState<TaxType>("individual");
  const [businessNumber, setBusinessNumber] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [taxInvoiceEmail, setTaxInvoiceEmail] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_my_tax_info");
      if (cancelled) return;
      if (error) {
        console.error("[TaxInfoSection] 조회 실패:", error);
        toast.error(t("taxInfoSection.loadError"));
      } else if (data && data.length > 0) {
        const info = data[0] as TaxInfo;
        setCurrentInfo(info);
        if (info.tax_type) setTaxType(info.tax_type);
        setBusinessNumber(info.business_number || "");
        setBusinessName(info.business_name || "");
        setTaxInvoiceEmail(info.tax_invoice_email || "");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, t]);

  const isBusiness = taxType.startsWith("business_");

  const handleSave = async () => {
    // 사업자 검증
    if (isBusiness) {
      const trimmedNum = businessNumber.trim();
      if (!trimmedNum) {
        toast.error(t("taxInfoSection.businessNumberMissing"));
        return;
      }
      // 사업자등록번호 형식 — 숫자만 10자리 또는 하이픈 포함 12자리(123-45-67890)
      const digitsOnly = trimmedNum.replace(/-/g, "");
      if (!/^\d{10}$/.test(digitsOnly)) {
        toast.error(t("taxInfoSection.businessNumberInvalid"));
        return;
      }
    }

    setSaving(true);
    const { error } = await supabase.rpc("update_my_tax_info", {
      p_tax_type: taxType,
      p_business_number: isBusiness ? businessNumber.trim() : null,
      p_business_name: isBusiness ? businessName.trim() : null,
      p_tax_invoice_email: isBusiness ? taxInvoiceEmail.trim() : null,
    });
    setSaving(false);

    if (error) {
      console.error("[TaxInfoSection] 저장 실패:", error);
      toast.error(t("taxInfoSection.saveErrorPrefix") + error.message);
      return;
    }

    toast.success(t("taxInfoSection.saveSuccess"));
    setCurrentInfo({
      tax_type: taxType,
      business_number: isBusiness ? businessNumber.trim() : null,
      business_name: isBusiness ? businessName.trim() : null,
      tax_invoice_email: isBusiness ? taxInvoiceEmail.trim() : null,
      tax_consent_at: new Date().toISOString(),
    });
  };

  // 등록 완료 일시를 로케일에 맞춰 포맷 (한/영)
  const localeTag = i18n.language?.startsWith("ko") ? "ko-KR" : "en-US";

  if (loading) {
    return (
      <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
        <h3 className="font-bold text-white mb-5 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          {t("taxInfoSection.title")}
        </h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
      <h3 className="font-bold text-white mb-2 flex items-center gap-2">
        <FileText className="w-4 h-4" />
        {t("taxInfoSection.title")}
      </h3>
      <p className="text-sm text-gray-500 mb-5">{t("taxInfoSection.subtitle")}</p>

      {/* 등록 완료 표시 */}
      {currentInfo?.tax_consent_at && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <span className="text-xs text-green-300">
            {t("taxInfoSection.consentBadge")} · {new Date(currentInfo.tax_consent_at).toLocaleString(localeTag)}
          </span>
        </div>
      )}

      {/* 세금 유형 선택 */}
      <div className="space-y-2 mb-5">
        {TAX_TYPE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              taxType === opt.value
                ? "border-[#a78bfa] bg-[#a78bfa]/5"
                : "border-white/5 hover:border-white/10 hover:bg-white/[0.02]"
            }`}
          >
            <input
              type="radio"
              name="tax_type"
              value={opt.value}
              checked={taxType === opt.value}
              onChange={(e) => setTaxType(e.target.value as TaxType)}
              className="mt-1 accent-[#a78bfa]"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{t(opt.labelKey)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t(opt.descKey)}</p>
            </div>
          </label>
        ))}
      </div>

      {/* 사업자 정보 입력 (사업자 선택 시) */}
      {isBusiness && (
        <div className="space-y-3 mb-5 p-4 bg-white/[0.02] rounded-lg border border-white/5">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              {t("taxInfoSection.businessNumberLabel")} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={businessNumber}
              onChange={(e) => setBusinessNumber(e.target.value)}
              placeholder="123-45-67890"
              maxLength={12}
              className="w-full px-3 py-2 bg-[#1c1c1e] border border-white/5 rounded-lg text-sm text-white placeholder-gray-600 focus:border-[#a78bfa] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">{t("taxInfoSection.businessNameLabel")}</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder={t("taxInfoSection.businessNamePlaceholder")}
              className="w-full px-3 py-2 bg-[#1c1c1e] border border-white/5 rounded-lg text-sm text-white placeholder-gray-600 focus:border-[#a78bfa] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              {t("taxInfoSection.taxInvoiceEmailLabel")}
            </label>
            <input
              type="email"
              value={taxInvoiceEmail}
              onChange={(e) => setTaxInvoiceEmail(e.target.value)}
              placeholder="tax@company.com"
              className="w-full px-3 py-2 bg-[#1c1c1e] border border-white/5 rounded-lg text-sm text-white placeholder-gray-600 focus:border-[#a78bfa] focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* 안내문 */}
      <div className="mb-5 p-3 bg-white/[0.02] rounded-lg border border-white/5">
        <p className="text-xs font-semibold text-gray-400 mb-1.5">ℹ️ {t("taxInfoSection.infoTitle")}</p>
        <ul className="space-y-1 text-xs text-gray-500">
          <li>• {t("taxInfoSection.infoIndividual")}</li>
          <li>• {t("taxInfoSection.infoBusiness")}</li>
          <li>• {t("taxInfoSection.infoUnregistered")}</li>
          <li>• {t("taxInfoSection.infoConsent")}</li>
        </ul>
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-[#a78bfa] hover:bg-[#9370f0] text-white font-medium"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("taxInfoSection.saveButton")}
      </Button>
    </div>
  );
}
