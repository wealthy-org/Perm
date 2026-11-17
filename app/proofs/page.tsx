import type { Metadata } from "next";
import ProofExplorer from "@/components/ProofExplorer";

export const metadata: Metadata = {
  title: "Settlement proof preview",
  description: "A demonstration of readable, policy-bound Perm settlement receipts.",
};

export default function ProofsPage() {
  return <ProofExplorer />;
}
