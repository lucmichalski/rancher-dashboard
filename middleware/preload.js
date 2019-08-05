export default async function(ctx) {
  await Promise.all([
    ctx.store.dispatch('prefs/loadCookies'),
    ctx.store.dispatch('k8s/loadAll'),
    ctx.store.dispatch('v1/loadSchemas'),
  ]);
}