"use client";

import { Component, type ReactNode } from "react";

/** 3D görüntüleyicide bir hata olursa sayfanın geri kalanı çalışmaya devam eder, yedek görünüm gösterilir. */
export class ViewerBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("3D görüntüleyici hatası:", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
