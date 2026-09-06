import "@testing-library/jest-dom/vitest";

/**
 * jsdom 不实现 window.matchMedia，但 src/hooks/use-mobile.ts 会在 useEffect 里调用它，
 * 进而被 SidebarProvider 触发。所有 sidebar 相关组件的渲染测试都需要这个桩。
 */
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
