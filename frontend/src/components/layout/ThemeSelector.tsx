import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "../../lib/theme";

const choices: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof Monitor;
}> = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();
  return (
    <div
      className="theme-selector flex items-center rounded-xl border p-1 backdrop-blur-xl"
      role="group"
      aria-label="Color theme"
    >
      {choices.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          title={`${label} theme`}
          aria-label={`${label} theme`}
          aria-pressed={preference === value}
          onClick={() => setPreference(value)}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${
            preference === value
              ? "theme-selector-active"
              : "text-stone-500 hover:bg-white/5"
          }`}
        >
          <Icon size={14} />
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}
