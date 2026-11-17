import type { Metadata } from "next";
import TradeApp from "@/components/TradeApp";

export const metadata: Metadata = {
  title: "Router preview",
  description: "Preview Perm route comparison and transparent fee rebate accounting.",
};

export default function TradePage() {
  return <TradeApp />;
}
