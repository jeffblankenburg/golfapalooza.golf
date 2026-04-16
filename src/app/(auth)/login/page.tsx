"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

function formatPhone(value: string): string {
  const numbers = value.replace(/\D/g, "");
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 6) return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
  return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
}

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const phoneNumbers = phone.replace(/\D/g, "");
  const isValid = phoneNumbers.length === 10;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    if (formatted.replace(/\D/g, "").length <= 10) {
      setPhone(formatted);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isValid) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumbers }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send verification code");
        return;
      }

      sessionStorage.setItem("pendingPhone", phoneNumbers);
      router.push("/verify");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-4 bg-white">
      <div />

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image
            src="/logo.png"
            alt="Golfapalooza"
            width={200}
            height={144}
            className="mx-auto mb-4"
            priority
          />
          <p className="text-gray-500">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="(555) 123-4567"
              autoFocus
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-[16px] text-gray-900 bg-white placeholder-gray-400"
              autoComplete="tel"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={!isValid || loading}
            className="w-full bg-green-700 text-white font-semibold py-3 rounded-xl active:bg-green-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Sending..." : "Send Code"}
          </button>
        </form>
      </div>

      <div className="pb-safe mb-4">
        <Link
          href="/spectator"
          className="inline-block px-8 py-3 bg-green-800 rounded-full active:bg-green-900 transition-colors"
        >
          <img
            src="/for-our-patrons.png"
            alt="For our patrons"
            className="h-4 w-auto"
          />
        </Link>
      </div>
    </div>
  );
}
