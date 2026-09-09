import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { GROUP_COLORS, type GroupColor } from '../core/types';
import styles from './components.module.css';

/** Hex values used for swatches; Chrome's own palette. */
export const COLOR_HEX: Record<GroupColor, string> = {
  grey: '#9aa0a6',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#1e8e3e',
  pink: '#d01884',
  purple: '#9334e6',
  cyan: '#007b83',
  orange: '#e8710a',
};

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <span className={`${styles.switch} ${disabled ? styles.switchDisabled : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.slider} />
    </span>
  );
}

export function ColorPicker({
  value,
  onChange,
  allowNone = true,
}: {
  value?: GroupColor;
  onChange: (value: GroupColor | undefined) => void;
  allowNone?: boolean;
}) {
  return (
    <div className={styles.colorPicker}>
      {allowNone ? (
        <button
          type="button"
          className={`${styles.colorSwatch} ${value === undefined ? styles.colorSwatchActive : ''}`}
          style={{
            background:
              'repeating-conic-gradient(#c9ced6 0% 25%, #ffffff 0% 50%) 50% / 10px 10px',
          }}
          title="Auto (rotate palette)"
          aria-label="Auto colour"
          onClick={() => onChange(undefined)}
        />
      ) : null}
      {GROUP_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          aria-label={color}
          className={`${styles.colorSwatch} ${value === color ? styles.colorSwatchActive : ''}`}
          style={{ background: COLOR_HEX[color] }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}

export function Badge({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return <span className={`${styles.badge} ${accent ? styles.badgeAccent : ''}`}>{children}</span>;
}

export function ColorDot({ color }: { color?: GroupColor }) {
  return (
    <span
      className={styles.dot}
      style={{ background: color ? COLOR_HEX[color] : 'transparent', border: color ? 'none' : '1px solid currentColor' }}
    />
  );
}

export interface ToastState {
  message: string;
  error?: boolean;
}

export function useToast(): {
  toast: ToastState | null;
  show: (message: string, error?: boolean) => void;
} {
  const [toast, setToast] = useState<ToastState | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  const show = useCallback((message: string, error = false) => setToast({ message, error }), []);
  return { toast, show };
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div className={`${styles.toast} ${toast.error ? styles.toastError : ''}`} role="status">
      {toast.message}
    </div>
  );
}

/** Download a string as a file from an extension page. */
export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsText(file);
  });
}
