import { cn } from "@/lib/utils";
import bobLogo from "@/assets/bob-logo.png";

interface BobLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "w-10 h-10",
  md: "w-16 h-16",
  lg: "w-20 h-20",
  xl: "w-24 h-24",
};

export function BobLogo({ size = "md", className }: BobLogoProps) {
  return (
    <img
      src={bobLogo}
      alt="Bud Over Bills"
      className={cn(
        "block rounded-[22%] object-cover shadow-lg shadow-primary/20",
        sizeClasses[size],
        className
      )}
    />
  );
}
