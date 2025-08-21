import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface LoadingButtonProps {
  children: ReactNode;
  onClick?: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  type?: 'button' | 'submit';
}

export function LoadingButton({
  children,
  onClick,
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
}: LoadingButtonProps) {
  const handleClick = async () => {
    if (loading || disabled) return;
    if (onClick) {
      try {
        await onClick();
      } catch (error) {
        console.error('Button action failed:', error);
      }
    }
  };

  // Map custom variants to shadcn variants
  const getVariant = () => {
    switch (variant) {
      case 'primary':
        return 'default';
      case 'secondary':
        return 'secondary';
      case 'danger':
        return 'destructive';
      default:
        return 'default';
    }
  };

  // Map custom sizes to shadcn sizes
  const getSize = () => {
    switch (size) {
      case 'sm':
        return 'sm';
      case 'md':
        return 'default';
      case 'lg':
        return 'lg';
      default:
        return 'default';
    }
  };

  return (
    <Button
      type={type}
      onClick={handleClick}
      disabled={loading || disabled}
      variant={getVariant()}
      size={getSize()}
      className={`${className} relative overflow-hidden ${
        variant === 'primary' && !loading
          ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transition-all duration-300'
          : ''
      } ${loading ? 'animate-pulse' : ''}`}
    >
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      <span className={`transition-all duration-200 ${loading ? 'opacity-75' : ''}`}>
        {children}
      </span>
      {variant === 'primary' && !loading && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
      )}
    </Button>
  );
}
