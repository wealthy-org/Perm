import type { Metadata } from "next";
import RebateCalculator from "@/components/RebateCalculator";

export const metadata: Metadata = {
  title: "Fee rebate preview",
  description: "Explore the illustrative accounting for Perm's router-level platform fee rebate.",
};

export default function RebatePage() {
  return <RebateCalculator />;
}
