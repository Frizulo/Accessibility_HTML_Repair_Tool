import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import { useEffect, useState } from "react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // 記住偏好：theme=dark/light；若沒有就跟隨系統
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") return true;
    if (saved === "light") return false;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  });

  useEffect(() => {
    const root = document.documentElement;

    // ✅ 重點：Tailwind/shadcn 用的是 "dark" class
    if (darkMode) root.classList.add("dark");
    else root.classList.remove("dark");

    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />

        {/* 這個 bar 也改成用 Tailwind tokens，才會跟著 dark 一起變 */}
        <div className="sticky top-0 z-50 flex items-center gap-3 border-b bg-background px-3 py-2 text-foreground">
          <div className="font-bold">無障礙 HTML 修繕工具</div>

          <button
            type="button"
            onClick={() => setDarkMode((v) => !v)}
            aria-label="切換暗色模式"
            title="切換暗色模式"
            className="ml-auto rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {darkMode ? "🌙 暗色" : "☀️ 亮色"}
          </button>
        </div>

        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
