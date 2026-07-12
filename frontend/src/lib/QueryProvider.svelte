<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query'
  import App from '../App.svelte'

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
</script>

<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
