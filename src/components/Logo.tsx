interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const sizes = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-10 w-10 text-base",
};

export default function Logo({ size = "md", showText = true, className = "" }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className={`${sizes[size]} flex items-center justify-center rounded-md bg-foreground text-background font-bold shrink-0`}
      >
        R
      </div>
      {showText && (
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Riunioni in Cloud
        </span>
      )}
    </div>
  );
}
