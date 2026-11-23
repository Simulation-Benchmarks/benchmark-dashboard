<script setup lang="ts">
defineProps<{ href: string | null; title: string; ariaLabel?: string }>();
</script>

<template>
  <a
    class="grid-action"
    :href="href || undefined"
    target="_blank"
    rel="noopener noreferrer"
    :title="title"
    :aria-label="ariaLabel || title"
    @click.stop
  >
    <slot />
  </a>
</template>
