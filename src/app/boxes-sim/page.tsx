import type { CSSProperties } from "react";
import BoxesSimulator from "@/components/v2/contests/BoxesSimulator";

export const metadata = { title: "Boxes Simulator" };

// Temporary standalone host for the Boxes grid + scoring + simulator (#230/#232).
// Pure client UI, no data — this becomes the admin "Simulate" panel on the real
// contest. Defines the v2 palette locally so it renders outside the app shell.
const palette: CSSProperties = {
  ["--brand" as string]: "#0a5c36",
  ["--paper" as string]: "#f6f6f1",
  ["--card" as string]: "#ffffff",
  ["--ink" as string]: "#17211c",
  ["--ink-soft" as string]: "#59635b",
  ["--line" as string]: "rgba(23,33,29,0.12)",
  ["--line-strong" as string]: "rgba(23,33,29,0.22)",
  background: "#f6f6f1",
  minHeight: "100vh",
  padding: "16px",
};

export default function BoxesSimPage() {
  return (
    <div style={palette}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <BoxesSimulator />
      </div>
    </div>
  );
}
