export default function WapyFooter() {
  return (
    <footer
      className="py-6 px-4 text-center"
      style={{ borderTop: "1px solid var(--store-border, #e5e7eb)" }}
    >
      <p className="text-xs" style={{ color: "var(--store-ink-muted, #9ca3af)" }}>
        Hecho con ✨{" "}
        <a
          href="https://wapy.com.ar"
          className="underline underline-offset-2 hover:opacity-75 transition-opacity"
          style={{ color: "var(--store-ink-muted, #9ca3af)" }}
          target="_blank"
          rel="noopener noreferrer"
        >
          Wapy
        </a>
      </p>
    </footer>
  );
}
