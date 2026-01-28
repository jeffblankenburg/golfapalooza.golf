import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-green-800 to-green-950">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Golfapalooza</h1>
        <p className="text-green-200 mb-8">
          Live scoring, tracking, and planning
        </p>
        <Link
          href="/scoring"
          className="inline-block bg-white text-green-800 font-semibold px-8 py-3 rounded-full shadow-lg hover:bg-green-50 transition-colors"
        >
          Get Started
        </Link>
      </div>
    </div>
  );
}
