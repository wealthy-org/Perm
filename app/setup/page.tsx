import type { Metadata } from "next";
import DeploymentSetup from "@/components/DeploymentSetup";

export const metadata: Metadata = {
  title: "Testnet setup",
  description: "Deploy the Perm router and restricted v4 adapter from an owner-controlled browser wallet on Robinhood Chain Testnet.",
};

export default function SetupPage() {
  return <DeploymentSetup />;
}
