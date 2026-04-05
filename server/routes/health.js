export default async function healthRoute(app) {
  app.get('/api/health', async () => {
    return {
      ok: true,
      ts: new Date().toISOString(),
      uptime: process.uptime(),
    }
  })
}
