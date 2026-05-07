import './app.css';
import Timeline from './lib/Timeline.svelte';
import { mount } from 'svelte';

const app = mount(Timeline, {
    target: document.getElementById('app'),
});

export default app;
