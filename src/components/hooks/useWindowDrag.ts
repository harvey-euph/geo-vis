import React, { useCallback, useRef, useState } from "react";

export function useWindowDrag(
  mapContainerRef: React.RefObject<HTMLDivElement | null>
) {
  const [showOptionsWindow, setShowOptionsWindow] = useState<boolean>(false);
  const showOptionsWindowRef = useRef<boolean>(showOptionsWindow);
  showOptionsWindowRef.current = showOptionsWindow;

  const optionsWindowRef = useRef<HTMLDivElement | null>(null);
  const [windowPos, setWindowPos] = useState<{ x: number; y: number }>({
    x: 16,
    y: 76,
  });
  const windowPosRef = useRef<{ x: number; y: number }>({ x: 16, y: 76 });
  const isDraggingWindowRef = useRef<boolean>(false);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    winX: number;
    winY: number;
  }>({ mouseX: 0, mouseY: 0, winX: 16, winY: 76 });
  const clearMapHoverRef = useRef<() => void>(() => {});

  const resetWindowPos = useCallback(() => {
    const defaultPos = { x: 16, y: 76 };
    windowPosRef.current = defaultPos;
    setWindowPos(defaultPos);
    if (optionsWindowRef.current) {
      optionsWindowRef.current.style.transform = `translate3d(${defaultPos.x}px, ${defaultPos.y}px, 0)`;
    }
  }, []);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.stopPropagation();
      e.preventDefault();

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }

      isDraggingWindowRef.current = true;
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        winX: windowPosRef.current.x,
        winY: windowPosRef.current.y,
      };

      if (mapContainerRef.current) {
        mapContainerRef.current.style.pointerEvents = "none";
      }

      clearMapHoverRef.current?.();
      document.body.style.userSelect = "none";
      document.body.style.cursor = "move";
    },
    [mapContainerRef]
  );

  const handleHeaderPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingWindowRef.current) return;
      e.stopPropagation();

      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;

      const newX = Math.max(
        10,
        Math.min(window.innerWidth - 380, dragStartRef.current.winX + dx)
      );
      const newY = Math.max(
        10,
        Math.min(window.innerHeight - 150, dragStartRef.current.winY + dy)
      );

      windowPosRef.current = { x: newX, y: newY };
      if (optionsWindowRef.current) {
        optionsWindowRef.current.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
      }
    },
    []
  );

  const handleHeaderPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingWindowRef.current) return;
      e.stopPropagation();

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }

      if (mapContainerRef.current) {
        mapContainerRef.current.style.pointerEvents = "";
      }

      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setWindowPos({ ...windowPosRef.current });

      setTimeout(() => {
        isDraggingWindowRef.current = false;
      }, 60);
    },
    [mapContainerRef]
  );

  const isPointOverOptionsWindow = useCallback(
    (clientX: number, clientY: number) => {
      if (!showOptionsWindowRef.current || !optionsWindowRef.current) {
        return false;
      }
      const rect = optionsWindowRef.current.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    },
    []
  );

  return {
    showOptionsWindow,
    setShowOptionsWindow,
    showOptionsWindowRef,
    optionsWindowRef,
    windowPos,
    windowPosRef,
    isDraggingWindowRef,
    clearMapHoverRef,
    resetWindowPos,
    handleHeaderPointerDown,
    handleHeaderPointerMove,
    handleHeaderPointerUp,
    isPointOverOptionsWindow,
  };
}
