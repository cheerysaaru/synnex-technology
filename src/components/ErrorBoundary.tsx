import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
          <h1 className="font-display text-2xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-gray-500">{this.state.error?.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="border border-black px-6 py-2 text-sm text-black transition-colors hover:bg-gray-100"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
