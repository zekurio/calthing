<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query'
  import App from '../App.svelte'
  import { ApiError } from './api'

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status === 401) && failureCount < 2,
      },
    },
  })
</script>

<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
