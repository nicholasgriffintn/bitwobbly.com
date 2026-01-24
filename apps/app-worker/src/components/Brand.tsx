interface BrandProps {
  subtitle?: string;
  variant?: 'light' | 'dark';
}

export default function Brand({ subtitle, variant = 'light' }: BrandProps) {
  return (
    <div className={`brand brand--${variant}`}>
      <div className="brand-mark">
        <span className="brand-mark__dot" />
        <span className="brand-mark__dot" />
        <span className="brand-mark__dot" />
      </div>
      <div>
        <div className="brand-title">Bit Wobbly</div>
        {subtitle && <div className="brand-subtitle">{subtitle}</div>}
      </div>
    </div>
  );
}
