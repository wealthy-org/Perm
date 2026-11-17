import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <Link className="wordmark" href="/" aria-label="Perm home">
          <img src="/perm-mark.png" alt="" />
          <span>PERM</span>
        </Link>
        <p>Compare supported routes. See every fee. Keep more of your swap.</p>
        <div className="footer-status"><i /> Interface preview · execution not yet enabled</div>
      </div>

      <div className="footer-links">
        <div>
          <h4>PRODUCT</h4>
          <Link href="/trade">Trade</Link>
          <Link href="/#routing">Routing</Link>
          <Link href="/#rebate">Fee rebate</Link>
          <Link href="/#proof">Proof receipts</Link>
        </div>
        <div>
          <h4>BUILD</h4>
          <Link href="/docs">Protocol notes</Link>
          <a href="https://github.com/wealthy-org/Perm" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
          <a href="https://developers.uniswap.org/docs/protocols/v4/concepts/hooks" target="_blank" rel="noopener noreferrer">Uniswap v4 hooks ↗</a>
        </div>
        <div>
          <h4>COMMUNITY</h4>
          <a href="https://x.com/usepermonx" target="_blank" rel="noopener noreferrer">X · @usepermonx ↗</a>
          <span>© 2026 Perm</span>
        </div>
      </div>
    </footer>
  );
}
