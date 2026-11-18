import TokenLogo from "./TokenLogo";
import type { LiveToken } from "@/lib/web3/tokens";

export default function LiveTokenMark({ token, size }: { token: LiveToken; size: number }) {
  if (token.symbol === "ETH") return <TokenLogo symbol="ETH" size={size} />;
  return (
    <span
      className="live-token-mark"
      style={{ width: size, height: size, background: token.color, fontSize: Math.max(8, size * 0.28) }}
      aria-hidden="true"
    >
      {token.symbol.slice(0, 3)}
    </span>
  );
}
