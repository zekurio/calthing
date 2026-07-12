import { mount } from 'svelte'
import './app.css'
import './lib/theme.svelte.ts'
import QueryProvider from './lib/QueryProvider.svelte'

const app = mount(QueryProvider, {
  target: document.getElementById('app')!,
})

export default app
