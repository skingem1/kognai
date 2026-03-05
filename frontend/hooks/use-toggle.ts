import { useState, useCallback } from 'react';

/**
 * Interface for the return value of the useToggle hook.
 */
interface UseToggleReturn {
  isOn: boolean;
  toggle: () => void;
  setOn: () => void;
  setOff: () => void;
  setValue: (value: boolean) => void;
}

/**
 * A lightweight React hook for toggling boolean state.
 * Useful for modals, dropdowns, sidebars, etc.
 */
function useToggle(initialValue: boolean = false): UseToggleReturn {
  const [isOn, setIsOn] = useState<boolean>(initialValue);

  const toggle = useCallback(() => {
    setIsOn((prev) => !prev);
  }, []);

  const setOn = useCallback(() => {
    setIsOn(true);
  }, []);

  const setOff = useCallback(() => {
    setIsOn(false);
  }, []);

  const setValue = useCallback((value: boolean) => {
    setIsOn(value);
  }, []);

  return { isOn, toggle, setOn, setOff, setValue };
}

export { useToggle };