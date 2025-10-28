"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Building,
  Hash,
  MapPin,
  Mail,
  Phone,
  CheckCircle,
  XCircle,
} from "lucide-react";

type FormData = {
  companyId: string;
  companyName: string;
  location: string;
  email: string;
  phone: string;
};

// Top-level input component to avoid creating components during render
function InputFieldComponent({
  label,
  name,
  type = "text",
  placeholder,
  required = false,
  icon: Icon,
  value,
  onChange,
  inputRef,
  hasError,
  isValid,
  submitted,
  errorText,
}: {
  label: string;
  name: keyof FormData;
  type?: string;
  placeholder: string;
  required?: boolean;
  icon: React.ElementType;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef: (el: HTMLInputElement | null) => void;
  hasError: boolean;
  isValid: boolean;
  submitted: boolean;
  errorText?: string;
}) {
  return (
    <div className="relative group">
      <label
        htmlFor={name}
        className="flex items-center text-sm font-bold text-black mb-2 cursor-pointer select-none"
      >
        <Icon className="w-4 h-4 mr-2 text-black/70" />
        {label}
        {required && <span className="text-red-600 ml-1">*</span>}
      </label>

      <div className="relative">
        <input
          id={name}
          ref={inputRef}
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`
              w-full pl-12 pr-12 py-4 text-base font-medium text-black
              bg-white border-2 rounded-xl transition-all duration-200
              placeholder-gray-500 outline-none
              ${
                hasError
                  ? "border-red-500"
                  : isValid && value
                  ? "border-green-500"
                  : "border-gray-500 focus:border-black"
              }
              focus:ring-4 focus:ring-black/10
            `}
        />

        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <Icon
            className={`w-5 h-5 transition-colors ${
              hasError
                ? "text-red-500"
                : isValid && value
                ? "text-green-600"
                : "text-black/60"
            }`}
          />
        </div>

        {submitted && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            {hasError ? (
              <XCircle className="w-5 h-5 text-red-500" />
            ) : isValid && value ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : null}
          </div>
        )}
      </div>

      {hasError && (
        <p className="mt-1.5 text-xs text-red-600 flex items-center font-medium">
          <XCircle className="w-3 h-3 mr-1" />
          {errorText}
        </p>
      )}
    </div>
  );
}

export default function InstitutionForm({
  onSubmit,
}: {
  onSubmit: (data: FormData) => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormData>({
    companyId: "",
    companyName: "",
    location: "",
    email: "",
    phone: "",
  });

  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );

  // Stable refs – created **once**
  const inputRefs = useRef<Record<keyof FormData, HTMLInputElement | null>>({
    companyId: null,
    companyName: null,
    location: null,
    email: null,
    phone: null,
  });

  // ---- Change handler (only updates the field you type in) ----
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const field = name as keyof FormData;

    // Normalize Company ID: remove spaces and uppercase so it matches the expected pattern
    const newValue =
      field === "companyId" ? value.replace(/\s+/g, "").toUpperCase() : value;

    setForm((prev) => ({ ...prev, [field]: newValue }));
    // Clear error immediately
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  // ---- Live button enable (no heavy validation) ----
  const canSubmit = useCallback(() => {
    return (
      form.companyId &&
      form.companyName &&
      form.location &&
      /^[A-Z0-9]{4,10}$/.test(form.companyId) &&
      (!form.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) &&
      (!form.phone || /^[\+]?[0-9\s\-\(\)]{10,20}$/.test(form.phone))
    );
  }, [form]);

  // ---- Full validation on submit ----
  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!form.companyId) newErrors.companyId = "Company ID is required";
    else if (!/^[A-Z0-9]{4,10}$/.test(form.companyId))
      newErrors.companyId = "Invalid ID (e.g. INST001)";

    if (!form.companyName) newErrors.companyName = "Company Name is required";
    if (!form.location) newErrors.location = "Location is required";

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      newErrors.email = "Invalid email format";

    if (form.phone && !/^[\+]?[0-9\s\-\(\)]{10,20}$/.test(form.phone))
      newErrors.phone = "Invalid phone format";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (validate()) {
      try {
        const maybePromise = onSubmit(form);
        if (maybePromise instanceof Promise) {
          await maybePromise;
        }

        // Clear the form and errors after successful submit
        setForm({
          companyId: "",
          companyName: "",
          location: "",
          email: "",
          phone: "",
        });
        setErrors({});
        setSubmitted(false);
        // Focus first input for convenience
        focusInput("companyId");
      } catch (err) {
        // If onSubmit throws, keep the form as-is so user can retry.
        // Log for debugging — don't expose to UI here.
        console.error("onSubmit error:", err);
      }
    }
  };

  // ---- Focus helper (stable) ----
  const focusInput = useCallback((field: keyof FormData) => {
    inputRefs.current[field]?.focus();
  }, []);

  // ---- Validation icons logic ----
  const isValid = (f: keyof FormData) => submitted && !errors[f];
  const hasError = (f: keyof FormData) => !!errors[f];

  // Replaced nested InputField with top-level InputFieldComponent to avoid recreation on each render

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-8 md:p-10 rounded-3xl shadow-2xl border border-gray-400"
    >
      {/* Header */}
      <div className="flex items-center mb-9">
        <div className="p-3 bg-black rounded-2xl mr-4 shadow-lg">
          <Building className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-extrabold text-black">
          Institution Details
        </h2>
      </div>

      {/* Grid */}
      <div className="grid md:grid-cols-2 gap-7">
        <InputFieldComponent
          label="Company ID"
          name="companyId"
          placeholder="e.g. INST001"
          required
          icon={Hash}
          value={form.companyId}
          onChange={handleChange}
          inputRef={(el) => {
            inputRefs.current["companyId"] = el;
          }}
          hasError={hasError("companyId")}
          isValid={isValid("companyId")}
          submitted={submitted}
          errorText={errors.companyId}
        />
        <InputFieldComponent
          label="Company Name"
          name="companyName"
          placeholder="e.g. National Institute of Technology"
          required
          icon={Building}
          value={form.companyName}
          onChange={handleChange}
          inputRef={(el) => {
            inputRefs.current["companyName"] = el;
          }}
          hasError={hasError("companyName")}
          isValid={isValid("companyName")}
          submitted={submitted}
          errorText={errors.companyName}
        />
        <InputFieldComponent
          label="Location"
          name="location"
          placeholder="e.g. Mumbai, India"
          required
          icon={MapPin}
          value={form.location}
          onChange={handleChange}
          inputRef={(el) => {
            inputRefs.current["location"] = el;
          }}
          hasError={hasError("location")}
          isValid={isValid("location")}
          submitted={submitted}
          errorText={errors.location}
        />
        <InputFieldComponent
          label="Contact Email"
          name="email"
          type="email"
          placeholder="e.g. admin@nit.ac.in"
          icon={Mail}
          value={form.email}
          onChange={handleChange}
          inputRef={(el) => {
            inputRefs.current["email"] = el;
          }}
          hasError={hasError("email")}
          isValid={isValid("email")}
          submitted={submitted}
          errorText={errors.email}
        />
        <div className="md:col-span-2">
          <InputFieldComponent
            label="Phone"
            name="phone"
            placeholder="e.g. +91 22 1234 5678"
            icon={Phone}
            value={form.phone}
            onChange={handleChange}
            inputRef={(el) => {
              inputRefs.current["phone"] = el;
            }}
            hasError={hasError("phone")}
            isValid={isValid("phone")}
            submitted={submitted}
            errorText={errors.phone}
          />
        </div>
      </div>

      {/* Submit – now works instantly */}
      <button
        type="submit"
        disabled={!canSubmit()}
        className={`
          mt-10 w-full py-5 px-8 bg-black text-white text-xl font-bold rounded-xl
          shadow-xl transition-all duration-300 flex items-center justify-center gap-3
          ${
            canSubmit()
              ? "hover:shadow-2xl hover:-translate-y-1 cursor-pointer opacity-100"
              : "opacity-60 cursor-not-allowed"
          }
        `}
      >
        <Building className="w-6 h-6" />
        Save Institution Details
      </button>
    </form>
  );
}
