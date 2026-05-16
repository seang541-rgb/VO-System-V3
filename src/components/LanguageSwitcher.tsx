import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ms', label: 'Bahasa Melayu' },
] as const;

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  return (
    <div className="relative inline-flex items-center gap-1.5">
      <Globe className="h-3.5 w-3.5 text-slate-400" />
      <select
        value={i18n.language}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className="appearance-none rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 hover:border-slate-600 focus:border-blue-600/60 focus:outline-none"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>{lang.label}</option>
        ))}
      </select>
    </div>
  );
}
