// ════════════════════════════════════════════════════════════════════════════
// 정산 계좌 등록/수정 모달 (MyPage 정산 카드)
//
// 동작:
//   - 은행 선택 + 계좌번호 + 예금주 입력 → update_my_payout_info RPC
//   - 성공 시 refreshProfile()로 프로필 갱신 → 카드에 즉시 반영
//   - 기존 등록 정보가 있으면 prefill
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { CreditCard, Loader2, X } from "lucide-react";
import { toast } from "sonner";

const KOREAN_BANKS = [
  "국민은행", "신한은행", "우리은행", "하나은행", "농협은행", "기업은행",
  "SC제일은행", "씨티은행", "카카오뱅크", "케이뱅크", "토스뱅크",
  "새마을금고", "우체국", "수협은행", "신협", "산업은행",
  "부산은행", "대구은행", "경남은행", "광주은행", "전북은행", "제주은행",
];

interface PayoutInfo {
  bank_name?: string;
  account_number?: string;
  account_holder?: string;
}

interface PayoutInfoModalProps {
  open: boolean;
  current?: PayoutInfo | null;
  onClose: () => void;
  onSaved: () => void;
}

export function PayoutInfoModal({ open, current, onClose, onSaved }: PayoutInfoModalProps) {
  const { t } = useTranslation();
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [saving, setSaving] = useState(false);

  // 열릴 때마다 기존 값으로 초기화
  useEffect(() => {
    if (open) {
      setBankName(current?.bank_name || "");
      setAccountNumber(current?.account_number || "");
      setAccountHolder(current?.account_holder || "");
    }
  }, [open, current?.bank_name, current?.account_number, current?.account_holder]);

  if (!open) return null;

  const acctDigits = accountNumber.replace(/[^0-9]/g, "").length;
  const canSubmit =
    bankName.trim().length > 0 &&
    acctDigits >= 6 && acctDigits <= 16 &&   // 서버 검증(숫자 6~16자리)과 일치 — 17자리+ 저장 후 400 방지
    accountHolder.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    const { error } = await supabase.rpc("update_my_payout_info", {
      p_bank_name: bankName.trim(),
      p_account_number: accountNumber.trim(),
      p_account_holder: accountHolder.trim(),
    });
    setSaving(false);

    if (error) {
      toast.error(t("mypage.payout.modal.error") + error.message);
      return;
    }
    toast.success(t("mypage.payout.modal.success"));
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#121212] border border-white/10 rounded-2xl p-5 md:p-6 max-w-md w-full">
        <div className="flex items-start justify-between gap-2 mb-4">
          <h4 className="text-lg font-bold text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#8b5cf6]" />
            {t("mypage.payout.modal.title")}
          </h4>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 text-gray-400"
            aria-label={t("common.close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">{t("mypage.payout.modal.notice")}</p>

        <div className="space-y-3">
          {/* 은행 */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              {t("mypage.payout.modal.bankLabel")} <span className="text-red-400">*</span>
            </label>
            <select
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full px-3 py-2 bg-[#1c1c1e] border border-white/5 rounded-lg text-sm text-white focus:border-[#a78bfa] focus:outline-none"
            >
              <option value="">{t("mypage.payout.modal.bankPlaceholder")}</option>
              {KOREAN_BANKS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* 계좌번호 */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              {t("mypage.payout.modal.accountLabel")} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder={t("mypage.payout.modal.accountPlaceholder")}
              maxLength={30}
              className="w-full px-3 py-2 bg-[#1c1c1e] border border-white/5 rounded-lg text-sm text-white placeholder-gray-600 focus:border-[#a78bfa] focus:outline-none"
            />
          </div>

          {/* 예금주 */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              {t("mypage.payout.modal.holderLabel")} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder={t("mypage.payout.modal.holderPlaceholder")}
              maxLength={40}
              className="w-full px-3 py-2 bg-[#1c1c1e] border border-white/5 rounded-lg text-sm text-white placeholder-gray-600 focus:border-[#a78bfa] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1">
            {t("mypage.payout.modal.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !canSubmit}
            className="flex-1 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("mypage.payout.modal.submit")}
          </Button>
        </div>
      </div>
    </div>
  );
}
