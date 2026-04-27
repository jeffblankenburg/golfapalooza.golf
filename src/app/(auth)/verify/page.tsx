"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logLogin } from "@/components/ActivityTracker";

export default function VerifyPage() {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const pendingPhone = sessionStorage.getItem("pendingPhone");
    if (!pendingPhone) {
      router.push("/login");
      return;
    }
    setPhone(pendingPhone);
    inputRefs.current[0]?.focus();
  }, [router]);

  const handleChange = (index: number, value: string) => {
    // Handle paste
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 6);
      const newCode = [...code];
      digits.split("").forEach((digit, i) => {
        if (index + i < 6) {
          newCode[index + i] = digit;
        }
      });
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      inputRefs.current[nextIndex]?.focus();

      if (newCode.every((d) => d !== "")) {
        handleVerify(newCode.join(""));
      }
      return;
    }

    // Handle single digit
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newCode.every((d) => d !== "")) {
      handleVerify(newCode.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (verificationCode: string) => {
    setError("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: `+1${phone}`,
        token: verificationCode,
        type: "sms",
      });

      if (error) {
        setError(error.message);
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }

      sessionStorage.removeItem("pendingPhone");
      logLogin();
      // Redirect to home page
      window.location.href = "/";
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResending(true);

    const networkBlockedMessage =
      "Couldn't reach the server. If you're on a work or school network, it may be blocking us — try a personal device or your phone's hotspot.";

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (!data) {
          setError(networkBlockedMessage);
        } else {
          setError(data.error || "Failed to resend code");
        }
      }
    } catch {
      setError(networkBlockedMessage);
    } finally {
      setResending(false);
    }
  };

  const handleDifferentNumber = () => {
    sessionStorage.removeItem("pendingPhone");
    router.push("/login");
  };

  const formattedPhone = phone
    ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
    : "";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-white">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Enter Code</h1>
          <p className="text-gray-500">
            We sent a code to {formattedPhone}
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex justify-center gap-2">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-14 text-center text-2xl font-bold border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 bg-white"
                disabled={loading}
              />
            ))}
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}

          {loading && (
            <p className="text-sm text-gray-500 text-center">Verifying...</p>
          )}

          <div className="flex flex-col items-center gap-2 pt-4">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-green-700 font-medium active:text-green-800 disabled:text-gray-400"
            >
              {resending ? "Sending..." : "Resend code"}
            </button>
            <button
              type="button"
              onClick={handleDifferentNumber}
              className="text-gray-500 active:text-gray-700"
            >
              Use different number
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
