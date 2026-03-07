"use client";

import { ClerkProvider as ImportedProvider } from "@clerk/nextjs";
import { dark, shadcn } from "@clerk/themes";
import { useTheme } from "next-themes";

interface ClerkProviderProps {
  children: React.ReactNode;
}

export const ClerkProvider = ({ children }: ClerkProviderProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <ImportedProvider
      appearance={{
        theme: resolvedTheme === "dark" ? [dark, shadcn] : [shadcn],
      }}
    >
      {children}
    </ImportedProvider>
  );
};
