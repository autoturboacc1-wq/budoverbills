import { Component, ErrorInfo, ReactNode } from "react";
import { captureException } from "@/lib/observability";

interface RouteErrorBoundaryProps {
  children: ReactNode;
  /** Short label shown in the fallback message, e.g. "หน้าทำสัญญา". */
  area?: string;
  /** Optional callback to reset the boundary (e.g. navigate away). */
  onReset?: () => void;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Granular error boundary for individual feature routes (contract, chat,
 * payment).  Unlike the top-level AppErrorBoundary, this one keeps the rest
 * of the app alive — only the route content is replaced by the fallback.
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureException(error, {
      area: this.props.area ?? "route",
      componentStack: info.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-card p-6 shadow-card text-center">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {this.props.area ? `เกิดข้อผิดพลาดใน${this.props.area}` : "เกิดข้อผิดพลาด"}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            หน้านี้ไม่สามารถแสดงผลได้ ลองรีโหลดหรือย้อนกลับไปหน้าหลัก
          </p>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              ลองอีกครั้ง
            </button>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="inline-flex items-center justify-center rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
            >
              ย้อนกลับ
            </button>
          </div>
        </div>
      </div>
    );
  }
}
