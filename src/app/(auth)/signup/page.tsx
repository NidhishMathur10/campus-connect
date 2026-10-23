import type { Metadata } from "next";
import { collegeEmailDomain } from "@/config/email";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return <SignupForm emailDomain={collegeEmailDomain()} />;
}
