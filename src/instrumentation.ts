export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run when server is actively serving requests, not during build time
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      const { startOddsCollector, loadSavedData } = await import('./lib/odds-collector');
      
      // Khôi phục dữ liệu đã lưu từ file log trước đó
      const loaded = loadSavedData();
      console.log(
        `[ODDS COLLECTOR] Restored from disk: ${loaded.snapshots} snapshots, ${loaded.results} results, ${loaded.entries} bucket entries`
      );

      // Tự động khởi động collector 1s/lần chạy ngầm
      startOddsCollector();
      console.log('🚀 [ODDS COLLECTOR] Background polling 1s/lần đã tự động kích hoạt!');
    }
  }
}
