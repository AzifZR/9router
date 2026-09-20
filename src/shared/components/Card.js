"use client";

import { cn } from "@/shared/utils/cn";

export default function Card({
  children,
  title,
  subtitle,
  icon,
  action,
  padding = "md",
  hover = false,
  elev = false,
  className,
  ...props
}) {
  const paddings = {
    none: "",
    xs: "p-3",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  return (
    <div
      className={cn(
        "bg-surface border border-border-subtle rounded-2xl shadow-[var(--shadow-soft)]",
        "ring-1 ring-black/[0.03] dark:ring-white/[0.05]",
        elev && "shadow-[var(--shadow-elev)]",
        hover && "hover:shadow-[var(--shadow-warm)] hover:border-brand-500/30 hover:-translate-y-px transition-all cursor-pointer",
        paddings[padding],
        className
      )}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="text-text-main font-semibold tracking-tight text-[15px] truncate">{title}</h3>
              )}
              {subtitle && (
                <p className="text-[13px] text-text-muted truncate">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

Card.Section = function CardSection({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "p-4 rounded-xl",
        "bg-surface-2/50 border border-border-subtle",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.Row = function CardRow({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "p-3 -mx-3 px-3 transition-colors",
        "border-b border-border-subtle last:border-b-0",
        "hover:bg-surface-2/50",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.ListItem = function CardListItem({
  children,
  actions,
  className,
  ...props
}) {
  return (
    <div
      className={cn(
        "group flex items-center justify-between p-3 -mx-3 px-3",
        "border-b border-border-subtle last:border-b-0",
        "hover:bg-surface-2/50 transition-colors",
        className
      )}
      {...props}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {actions && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  );
};
