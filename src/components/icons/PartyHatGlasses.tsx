import { type LucideProps } from 'lucide-react';

export function PartyHatGlasses({ size = 24, className, ...props }: LucideProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M14,18C14,16.903 13.097,16 12,16C10.903,16 10,16.903 10,18" fill="none" fillRule="nonzero" />
      <path d="M12,6.968L15.231,2.99L18.34,6.968L22,2.992L22,11M12,6.968L8.769,2.99L5.66,6.968L2,2.992L2,11M2,11L22,11" fill="none" />
      <circle cx="17" cy="18" r="3" fill="none" />
      <circle cx="7" cy="18" r="3" fill="none" />
    </svg>
  );
}
