<script>
  // Svelte
  import { onDestroy, onMount } from 'svelte';
  import { createLogger } from 'candy-logger';

  // createLogger() gives you an instance you own — remember to destroy it.
  const logger = createLogger({
    enabled: import.meta.env.DEV,
    theme: 'auto',
    badgeText: 'SVELTE',
  });

  onMount(() => logger.success('Component mounted'));

  // destroy() removes the panel, every listener it added and its stylesheet,
  // so nothing leaks across hot reloads.
  onDestroy(() => logger.destroy());

  function loadOrders() {
    logger.tagged({ label: 'API', bg: 'rgba(125,211,252,.16)', color: '#7dcfff' }, 'info', 'GET /api/orders');
  }
</script>

<button on:click={loadOrders}>Load orders</button>
