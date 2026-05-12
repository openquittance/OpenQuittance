'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun, Laptop } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-7 h-7" />;

  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Laptop;

  return (
    <button
      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
      onClick={() => setTheme(next)}
      title={`Thème: ${theme}`}
    >
      <Icon size={16} />
    </button>
  );
}
