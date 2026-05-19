import { Mail, AlertCircle, CheckCircle } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

interface EmailConfirmationBannerProps {
  email: string;
  onClose: () => void;
}

export function EmailConfirmationBanner({ email, onClose }: EmailConfirmationBannerProps) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md mx-4"
    >
      <div className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] p-4 rounded-lg shadow-2xl border border-white/20">
        <div className="flex items-start gap-3 text-white">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium mb-1">{t("emailConfirm.title")}</h3>
            <p className="text-sm text-white/90 mb-3">
              {t("emailConfirm.description", { email })}
            </p>
            <div className="space-y-2 text-sm text-white/80">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Check your inbox</span>
              </div>
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Check spam folder too</span>
              </div>
              <div className="flex items-start gap-2">
                <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Click the verification link to sign in</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <span className="text-white text-sm">×</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
