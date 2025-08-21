import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface StatusIndicatorProps {
  isActive: boolean | null;
}

export function StatusIndicator({ isActive }: StatusIndicatorProps) {
  if (isActive === null) {
    return (
      <Badge
        variant="outline"
        className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
      >
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        <span className="text-xs font-medium">Checking…</span>
      </Badge>
    );
  } else if (isActive) {
    return (
      <Badge className="flex items-center gap-1.5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200">
        <div className="h-1.5 w-1.5 bg-white rounded-full animate-pulse"></div>
        <span className="text-xs font-medium">Active</span>
      </Badge>
    );
  } else {
    return (
      <Badge
        variant="destructive"
        className="flex items-center gap-1.5 shadow-sm hover:shadow-md transition-all duration-200"
      >
        <div className="h-1.5 w-1.5 bg-white rounded-full"></div>
        <span className="text-xs font-medium">Inactive</span>
      </Badge>
    );
  }
}
