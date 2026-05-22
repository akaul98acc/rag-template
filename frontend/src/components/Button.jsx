export default function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  onClick,
  type = "button",
  children,
  className = "",
  ...rest
}) {
  const classes = ["btn", `btn--${variant}`, `btn--${size}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}
