import { Suspense } from "react";
import { LoginForm } from "../../login/LoginForm";

// B2B login prompt — reuses the existing LoginForm component.
// The ?next param will redirect back to wholesale after login.
export default function WholesaleLoginPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
        <h1 className="text-lg font-semibold text-amber-800">
          পাইকারি মূল্য দেখতে লগইন করুন
        </h1>
        <p className="mt-1 text-sm text-amber-600">
          শুধুমাত্র যাচাইকৃত পাইকারি ক্রেতাদের জন্য পাইকারি মূল্য ও টায়ার প্রাইস
          দেখানো হয়। লগইন করে আপনার অ্যাকাউন্ট যাচাই করুন।
        </p>
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
