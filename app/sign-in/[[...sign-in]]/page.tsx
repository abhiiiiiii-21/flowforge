import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="auth-page">
      <SignIn
        appearance={{
          variables: {
            colorPrimary: "#A855F7",
            colorBackground: "#101010",
            colorInputBackground: "#171717",
            colorInputText: "#FFFFFF",
            colorText: "#FFFFFF",
            colorTextSecondary: "rgba(255,255,255,0.7)",
            borderRadius: "10px",
          },
          elements: {
            card: { boxShadow: "none", border: "1px solid rgba(255,255,255,0.08)" },
          },
        }}
      />
    </div>
  );
}