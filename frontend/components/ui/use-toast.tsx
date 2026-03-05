"use client";

import * as React from "react";

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

interface ToastState {
  toasts: Toast[];
}

let listeners: Array<(state: ToastState) => void> = [];
let memoryState: ToastState = { toasts: [] };

function dispatch(action: { type: "ADD" | "DISMISS"; toast?: Toast; toastId?: string }) {
  if (action.type === "ADD" && action.toast) {
    memoryState = { toasts: [...memoryState.toasts, action.toast] };
    setTimeout(() => {
      dispatch({ type: "DISMISS", toastId: action.toast!.id });
    }, 5000);
  } else if (action.type === "DISMISS") {
    memoryState = { toasts: memoryState.toasts.filter((t) => t.id !== action.toastId) };
  }
  listeners.forEach((listener) => listener(memoryState));
}

function toast({ title, description, variant = "default" }: Omit<Toast, "id">) {
  const id = Math.random().toString(36).slice(2);
  dispatch({ type: "ADD", toast: { id, title, description, variant } });
  return { id, dismiss: () => dispatch({ type: "DISMISS", toastId: id }) };
}

function useToast() {
  const [state, setState] = React.useState<ToastState>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      listeners = listeners.filter((l) => l !== setState);
    };
  }, []);

  return { ...state, toast, dismiss: (toastId: string) => dispatch({ type: "DISMISS", toastId }) };
}

export { useToast, toast };
