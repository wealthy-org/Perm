import type { Metadata } from "next";
import RouteExplorer from "@/components/RouteExplorer";

export const metadata: Metadata = {
  title: "Route explorer",
  description: "Illustrative Perm route comparison fixtures for direct venues and verified hook candidates.",
};

export default function RoutesPage() {
  return <RouteExplorer />;
}
