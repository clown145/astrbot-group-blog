import type { ReactElement } from "react";

type StackSection = {
  title: string;
  items: string[];
};

type StackGridProps = {
  sections: StackSection[];
};

export default function StackGrid({
  sections,
}: StackGridProps): ReactElement {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {sections.map((section) => (
        <article
          key={section.title}
          className="rounded-[1.75rem] border border-line bg-white/85 p-6 shadow-[var(--shadow-card)]"
        >
          <p className="text-sm uppercase tracking-[0.2em] text-ink-soft">
            {section.title}
          </p>
          <ul className="mt-5 space-y-3">
            {section.items.map((item) => (
              <li
                key={item}
                className="rounded-2xl bg-paper px-4 py-3 text-sm leading-6 text-ink"
              >
                {item}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
