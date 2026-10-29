export default function Brand({ onReset }: { onReset?: () => void }) {
  return (
    <a
      className="brand product-brand"
      href="./"
      onClick={(e) => {
        if (onReset) {
          e.preventDefault();
          onReset();
        }
      }}
      aria-label="あなたの普通、何％？ トップ"
    >
      <span className="product-brand-mark" aria-hidden="true">
        <i />
        <b />
        <em />
      </span>
      <span className="product-brand-wordmark">
        あなたの普通、<strong>何％？</strong>
      </span>
    </a>
  );
}
