import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { loginStep1, verifyOtp } from "@/services/api";

interface Step1Form {
  email: string;
  orgCode: string;
}

interface Step1Errors {
  email?: string;
  orgCode?: string;
  general?: string;
}

interface Step2Errors {
  otp?: string;
  general?: string;
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<Step1Form>({ email: "", orgCode: "" });
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step1Errors, setStep1Errors] = useState<Step1Errors>({});
  const [step2Errors, setStep2Errors] = useState<Step2Errors>({});
  const [loading, setLoading] = useState(false);

  function validateStep1(): boolean {
    const errors: Step1Errors = {};
    if (!form.email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errors.email = "Enter a valid email address";
    if (!form.orgCode.trim()) errors.orgCode = "Organisation code is required";
    setStep1Errors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateStep2(): boolean {
    const errors: Step2Errors = {};
    if (!otp.trim()) errors.otp = "OTP is required";
    else if (!/^\d{6}$/.test(otp)) errors.otp = "Enter the 6-digit code";
    setStep2Errors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!validateStep1()) return;
    setLoading(true);
    setStep1Errors({});
    try {
      const result = await loginStep1(form.email, form.orgCode);
      setMaskedPhone(result.masked_phone);
      setStep(2);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setStep1Errors({ general: "Invalid email or organisation code" });
      } else if (status === 422) {
        setStep1Errors({ general: "No phone number on file for this account" });
      } else {
        setStep1Errors({ general: "Could not send OTP — please try again" });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!validateStep2()) return;
    setLoading(true);
    setStep2Errors({});
    try {
      const result = await verifyOtp(form.email, form.orgCode, otp);
      login(result.access_token);
      navigate("/step1", { replace: true });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail;
        if (detail === "OTP expired or not found") {
          setStep2Errors({ otp: "This code has expired. Please request a new one." });
        } else {
          setStep2Errors({ otp: "Incorrect code. Please try again." });
        }
      } else {
        setStep2Errors({ general: "Verification failed — please try again" });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-fg mb-1">RAG Builder</h1>
        <p className="text-sm text-fg-muted mb-6">
          {step === 1 ? "Sign in to your account" : `Enter the code sent to ${maskedPhone}`}
        </p>

        {step === 1 ? (
          <form onSubmit={handleSendOtp} noValidate>
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-fg mb-1">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                aria-describedby={step1Errors.email ? "email-error" : undefined}
                aria-invalid={!!step1Errors.email}
              />
              {step1Errors.email && (
                <p id="email-error" className="mt-1 text-sm text-red-500" role="alert">
                  {step1Errors.email}
                </p>
              )}
            </div>

            <div className="mb-5">
              <label htmlFor="orgCode" className="block text-sm font-medium text-fg mb-1">
                Organisation Code
              </label>
              <Input
                id="orgCode"
                type="text"
                autoComplete="organization"
                value={form.orgCode}
                onChange={(e) => setForm((f) => ({ ...f, orgCode: e.target.value }))}
                aria-describedby={step1Errors.orgCode ? "orgCode-error" : undefined}
                aria-invalid={!!step1Errors.orgCode}
              />
              {step1Errors.orgCode && (
                <p id="orgCode-error" className="mt-1 text-sm text-red-500" role="alert">
                  {step1Errors.orgCode}
                </p>
              )}
            </div>

            {step1Errors.general && (
              <p className="mb-4 text-sm text-red-500" role="alert">
                {step1Errors.general}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send OTP"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} noValidate>
            <div className="mb-5">
              <label htmlFor="otp" className="block text-sm font-medium text-fg mb-1">
                One-Time Password
              </label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                aria-describedby={step2Errors.otp ? "otp-error" : undefined}
                aria-invalid={!!step2Errors.otp}
                placeholder="000000"
                className="tracking-widest text-center text-lg"
              />
              {step2Errors.otp && (
                <p id="otp-error" className="mt-1 text-sm text-red-500" role="alert">
                  {step2Errors.otp}
                </p>
              )}
            </div>

            {step2Errors.general && (
              <p className="mb-4 text-sm text-red-500" role="alert">
                {step2Errors.general}
              </p>
            )}

            <Button type="submit" className="w-full mb-3" disabled={loading}>
              {loading ? "Verifying…" : "Verify"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setStep(1);
                setOtp("");
                setStep2Errors({});
              }}
              className="w-full text-sm text-primary hover:underline"
            >
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
