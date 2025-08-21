import { useEffect } from 'react';
import { toast } from 'sonner';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onClose: (id: string) => void;
}

export function Toast({ id, type, title, message, duration = 5000, onClose }: ToastProps) {
  useEffect(() => {
    const showToast = () => {
      const toastContent = message ? `${title}\n${message}` : title;

      switch (type) {
        case 'success':
          toast.success(toastContent, {
            id,
            duration,
            onDismiss: () => onClose(id),
            onAutoClose: () => onClose(id),
          });
          break;
        case 'error':
          toast.error(toastContent, {
            id,
            duration,
            onDismiss: () => onClose(id),
            onAutoClose: () => onClose(id),
          });
          break;
        case 'warning':
          toast.warning(toastContent, {
            id,
            duration,
            onDismiss: () => onClose(id),
            onAutoClose: () => onClose(id),
          });
          break;
        case 'info':
        default:
          toast.info(toastContent, {
            id,
            duration,
            onDismiss: () => onClose(id),
            onAutoClose: () => onClose(id),
          });
          break;
      }
    };

    showToast();

    return () => {
      toast.dismiss(id);
    };
  }, [id, type, title, message, duration, onClose]);

  return null; // Sonner handles rendering
}

interface ToastContainerProps {
  toasts: Array<{
    id: string;
    type: ToastType;
    title: string;
    message?: string;
    duration?: number;
  }>;
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  useEffect(() => {
    toasts.forEach((toastData) => {
      const showToast = () => {
        const toastContent = toastData.message ? `${toastData.title}\n${toastData.message}` : toastData.title;

        switch (toastData.type) {
          case 'success':
            toast.success(toastContent, {
              id: toastData.id,
              duration: toastData.duration || 5000,
              onDismiss: () => onClose(toastData.id),
              onAutoClose: () => onClose(toastData.id),
            });
            break;
          case 'error':
            toast.error(toastContent, {
              id: toastData.id,
              duration: toastData.duration || 5000,
              onDismiss: () => onClose(toastData.id),
              onAutoClose: () => onClose(toastData.id),
            });
            break;
          case 'warning':
            toast.warning(toastContent, {
              id: toastData.id,
              duration: toastData.duration || 5000,
              onDismiss: () => onClose(toastData.id),
              onAutoClose: () => onClose(toastData.id),
            });
            break;
          case 'info':
          default:
            toast.info(toastContent, {
              id: toastData.id,
              duration: toastData.duration || 5000,
              onDismiss: () => onClose(toastData.id),
              onAutoClose: () => onClose(toastData.id),
            });
            break;
        }
      };

      showToast();
    });
  }, [toasts, onClose]);

  return null; // Sonner handles rendering
}
