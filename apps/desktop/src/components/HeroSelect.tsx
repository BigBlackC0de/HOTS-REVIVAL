import type { Hero } from "../lib/types";
import { ROLE_FR } from "../lib/format";

const ROLE_ORDER = ["Tank", "Bruiser", "Healer", "Support", "Ranged Assassin", "Melee Assassin"];

export function HeroSelect({ heroes, value, onChange, exclude = [], placeholder = "— Héros —" }: {
  heroes: Hero[]; value: string; onChange: (id: string) => void; exclude?: string[]; placeholder?: string;
}) {
  return (
    <select className="w-full" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {ROLE_ORDER.map((role) => (
        <optgroup key={role} label={ROLE_FR[role]}>
          {heroes
            .filter((h) => h.role === role && (h.id === value || !exclude.includes(h.id)))
            .map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
