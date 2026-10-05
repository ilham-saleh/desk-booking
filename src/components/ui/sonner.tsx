"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      offset={20}
      gap={10}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border-border !shadow-lg !font-sans !text-sm !gap-2.5 !py-3.5",
          title: "!font-semibold !text-foreground",
          description: "!text-muted-foreground",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-danger",
        },
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--text-primary)",
          "--normal-border": "var(--border-subtle)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
