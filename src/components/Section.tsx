import type { ReactNode, Ref } from "react";

interface Props {
  id: string;
  title: string;
  /** One sentence on what the section shows. */
  intro?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  sectionRef?: Ref<HTMLElement>;
}

export function Section({ id, title, intro, aside, children, sectionRef }: Props) {
  return (
    <section id={id} className="section" aria-labelledby={`${id}-title`} ref={sectionRef}>
      <header className="section-head">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          {intro && <p className="section-intro">{intro}</p>}
        </div>
        {aside && <div className="section-aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/** Shown inside a section whose own data failed, so the rest of the page keeps working. */
export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="section-error" role="alert">
      <p>{message}</p>
      <button type="button" className="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function SectionLoading({ children }: { children: ReactNode }) {
  return (
    <p className="section-loading" role="status">
      {children}
    </p>
  );
}
