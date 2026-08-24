import { mount } from 'svelte';
// Deliberately the very same component as the hosted app: this build differs
// only in where its data lives, which vite.config.ts swaps by alias.
import App from '../../web/src/App.svelte';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

export default mount(App, { target });
