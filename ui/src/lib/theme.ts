import { computed, ref } from 'vue';

export interface ThemeColors {
  surface: string;
  plot: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
}

export const dark = ref(localStorage.getItem('benchmark-theme') === 'dark');
export const colors = computed<ThemeColors>(() => dark.value
  ? { surface: '#21242a', plot: '#17191d', text: '#f4f5f7', muted: '#b4bac4', line: '#3c414b', accent: '#c8ced8' }
  : { surface: '#ffffff', plot: '#f7f8fb', text: '#000e52', muted: '#4f4f4f', line: '#e5e5e6', accent: '#046cb4' });

export function setDark(value: boolean): void {
  dark.value = value;
  document.documentElement.classList.toggle('app-dark', value);
  document.documentElement.style.colorScheme = value ? 'dark' : 'light';
  localStorage.setItem('benchmark-theme', value ? 'dark' : 'light');
}

setDark(dark.value);
