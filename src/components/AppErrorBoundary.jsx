import { Component } from "react";

/** React xatolarida bo'sh ekran o'rniga xabar ko'rsatadi. */
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("AppErrorBoundary:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
          <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-lg">
            <h1 className="text-lg font-semibold text-red-700">Dastur xatosi</h1>
            <p className="mt-2 text-sm text-slate-600">
              {this.state.error?.message || "Noma'lum xatolik"}
            </p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => window.location.reload()}
            >
              Qayta yuklash
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
