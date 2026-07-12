import { mount } from 'svelte'
import './app.css'
import QueryProvider from './lib/QueryProvider.svelte'

const app = mount(QueryProvider, {
  target: document.getElementById('app')!,
})

export default app
