'use client';

import { useEffect, useRef } from 'react';
import lottie, { AnimationItem } from 'lottie-web';
import { LottieAnimation } from '@/lib/lottie-optimizer';

interface LottiePreviewProps {
  animationData: LottieAnimation;
  className?: string;
}

export default function LottiePreview({ animationData, className = '' }: LottiePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (animationRef.current) {
      animationRef.current.destroy();
    }

    animationRef.current = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: animationData,
    });

    return () => {
      if (animationRef.current) {
        animationRef.current.destroy();
        animationRef.current = null;
      }
    };
  }, [animationData]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
    />
  );
}
