import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import App from './App.vue';
import './styles.css';

const DashboardTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#e8f4fb',
      100: '#c6e3f4',
      200: '#91c8e8',
      300: '#5caddc',
      400: '#2491cf',
      500: '#046cb4',
      600: '#035f9f',
      700: '#025087',
      800: '#02416e',
      900: '#013257',
      950: '#001d33',
    },
    colorScheme: {
      light: {
        primary: {
          color: '#046cb4',
          contrastColor: '#ffffff',
          hoverColor: '#0da5de',
          activeColor: '#035f9f',
        },
      },
      dark: {
        primary: {
          color: '#c8ced8',
          contrastColor: '#17191d',
          hoverColor: '#e2e6ec',
          activeColor: '#d5dbe3',
        },
      },
    },
  },
});

createApp(App)
  .use(PrimeVue, { theme: { preset: DashboardTheme, options: { darkModeSelector: '.app-dark' } } })
  .mount('#app');
