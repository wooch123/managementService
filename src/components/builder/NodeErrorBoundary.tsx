'use client';

import { Component, type ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export class NodeErrorBoundary extends Component<
  { children: ReactNode; typeName: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[canvas] ${this.props.typeName} 렌더 오류:`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive">
          <AlertDescription>{this.props.typeName} 렌더링 중 오류가 발생했습니다.</AlertDescription>
        </Alert>
      );
    }
    return this.props.children;
  }
}
